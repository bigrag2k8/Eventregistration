"use server";

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { esc } from "@/lib/email";
import { effectivePlan } from "@/lib/plans";

const DEFAULT_FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";

function buildFrom(org: { name: string; fromEmail: string | null; fromName: string | null }) {
  if (org.fromEmail) {
    const name = org.fromName ?? org.name;
    return `${name} <${org.fromEmail}>`;
  }
  return DEFAULT_FROM;
}

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

const schema = z.object({
  eventId: z.string(),
  subject: z.string().min(2).max(200),
  body: z.string().min(10).max(20000),
});

export async function sendCampaignAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization");

  const eventIdRaw = String(formData.get("eventId") ?? "");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/dashboard/events/${eventIdRaw}/campaigns?error=validation`);
  const data = parsed.data;

  const event = await prisma.event.findFirst({
    where: { id: data.eventId, ...orgScope(session), deletedAt: null },
    include: { organization: true, location: true },
  });
  if (!event) throw new Error("Event not found");

  // Plan limit enforcement
  const org = event.organization;
  const plan = effectivePlan(org);
  const limit = plan.emailCampaignsPerEvent;
  if (limit !== null) {
    const sentCount = await prisma.emailCampaign.count({
      where: { eventId: event.id, sentAt: { not: null } },
    });
    if (sentCount >= limit) {
      redirect(`/dashboard/events/${event.id}/campaigns?error=campaign_limit`);
    }
  }

  // Find recipients — confirmed registrations only, dedup by email
  const regs = await prisma.registration.findMany({
    where: { eventId: event.id, status: "CONFIRMED" },
    select: { email: true, firstName: true, lastName: true },
  });
  const recipients = Array.from(
    new Map(regs.map((r) => [r.email.toLowerCase(), r])).values()
  );

  if (recipients.length === 0) {
    redirect(`/dashboard/events/${event.id}/campaigns?error=no_recipients`);
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      eventId: event.id,
      subject: data.subject,
      bodyHtml: htmlBody(data.body, event, org),
      bodyText: data.body,
      recipientsCount: 0, // updated after sending
    },
  });

  const client = resend();
  const from = buildFrom(org);
  let sent = 0; let failed = 0;

  for (const r of recipients) {
    const personalized = htmlBody(data.body, event, org, r.firstName ?? undefined);
    try {
      if (client) {
        const res = await client.emails.send({
          from,
          to: r.email,
          subject: data.subject,
          html: personalized,
        });
        await prisma.emailLog.create({
          data: {
            campaignId: campaign.id,
            toEmail: r.email,
            kind: "ORGANIZER_BLAST",
            subject: data.subject,
            status: res.data?.id ? "SENT" : "FAILED",
            providerId: res.data?.id ?? null,
            sentAt: new Date(),
          },
        });
        if (res.data?.id) sent++; else failed++;
      } else {
        // No Resend key — log but mark as failed
        await prisma.emailLog.create({
          data: {
            campaignId: campaign.id,
            toEmail: r.email,
            kind: "ORGANIZER_BLAST",
            subject: data.subject,
            status: "FAILED",
            errorMessage: "RESEND_API_KEY not set",
          },
        });
        failed++;
      }
    } catch (e: any) {
      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
          toEmail: r.email,
          kind: "ORGANIZER_BLAST",
          subject: data.subject,
          status: "FAILED",
          errorMessage: String(e?.message ?? e).slice(0, 500),
        },
      });
      failed++;
    }
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { sentAt: new Date(), recipientsCount: sent },
  });

  await audit({
    organizationId: org.id, eventId: event.id, userId: session.sub,
    action: "campaign.send", targetType: "EmailCampaign", targetId: campaign.id,
    metadata: { subject: data.subject, sent, failed, recipientCount: recipients.length },
  });

  revalidatePath(`/dashboard/events/${event.id}/campaigns`);
  // Server actions used as <form action={...}> must return void.
  // Success indicators: the page revalidates → new row appears in "Sent broadcasts",
  // counter increments, and the audit log records sent / failed counts.
}

function htmlBody(body: string, event: any, org: any, firstName?: string) {
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor))
    ? org.brandColor : "#1F3A8A";
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${esc(org.name)}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${org.slug}/events/${event.slug}`;
  const venueLine = event.location
    ? `<p style="color:#475569;margin:0 0 8px"><strong>Location:</strong> ${esc(`${event.location.venueName ?? ""} ${event.location.addressLine1 ?? ""}, ${event.location.city ?? ""}`)}</p>`
    : "";
  // firstName is attendee-supplied from the public form — must be escaped.
  // The body itself is organizer-authored and intentionally allows HTML.
  const greeting = firstName ? `Hi ${esc(firstName)},` : "Hi,";

  // Convert plain newlines to <br> if body looks like plain text
  const looksLikeHtml = body.includes("<") && body.includes(">");
  const formattedBody = looksLikeHtml ? body : body.replace(/\n/g, "<br>");

  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
    <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
      <tr><td>
        ${logo}
        <h2 style="color:${brand};margin:0 0 4px">${esc(event.name)}</h2>
        ${venueLine}
        <p style="color:#0f172a;margin:24px 0 8px">${greeting}</p>
        <div style="color:#0f172a;line-height:1.6">${formattedBody}</div>
        <p style="margin-top:32px">
          <a href="${eventUrl}" style="display:inline-block;background:${brand};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
            View event details
          </a>
        </p>
      </td></tr>
    </table>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">
      Sent by ${esc(org.name)} via Your Events App.<br>
      You received this because you registered for <em>${esc(event.name)}</em>.
    </p>
  </body></html>`;
}
