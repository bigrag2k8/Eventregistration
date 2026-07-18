"use server";

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { signUnsubscribeToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { esc } from "@/lib/email";

const DEFAULT_FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";
const SITE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app").replace(/\/+$/, "");
// One marketing blast per org per day — a soft guard against accidental
// double-sends and against burning sender reputation with rapid-fire blasts.
const MARKETING_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

/**
 * The org's marketing audience: every distinct email that has a CONFIRMED
 * registration for any of the org's events, MINUS anyone who unsubscribed from
 * this org's marketing. Case-insensitive dedup on email.
 */
export async function marketingAudience(organizationId: string): Promise<{ email: string; firstName: string | null }[]> {
  const [regs, unsubs] = await Promise.all([
    prisma.registration.findMany({
      where: { status: "CONFIRMED", event: { organizationId, deletedAt: null } },
      select: { email: true, firstName: true },
    }),
    prisma.marketingUnsubscribe.findMany({ where: { organizationId }, select: { email: true } }),
  ]);
  const blocked = new Set(unsubs.map((u) => u.email.toLowerCase()));
  const byEmail = new Map<string, { email: string; firstName: string | null }>();
  for (const r of regs) {
    const key = r.email.toLowerCase();
    if (blocked.has(key) || byEmail.has(key)) continue;
    byEmail.set(key, { email: r.email, firstName: r.firstName });
  }
  return [...byEmail.values()];
}

const schema = z.object({
  subject: z.string().min(2).max(200),
  body: z.string().min(10).max(20000),
  promotedEventId: z.string().optional(),
});

export async function sendMarketingCampaignAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization");
  const orgId = session.orgId;

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/dashboard/marketing?error=validation`);
  const data = parsed.data;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Organization not found");

  // Cooldown: refuse a second blast within 24h.
  const recent = await prisma.marketingCampaign.findFirst({
    where: { organizationId: orgId, sentAt: { gte: new Date(Date.now() - MARKETING_COOLDOWN_MS) } },
    orderBy: { sentAt: "desc" },
  });
  if (recent) redirect(`/dashboard/marketing?error=marketing_cooldown`);

  // Optional promoted event must belong to this org.
  let promoted: { slug: string; name: string } | null = null;
  if (data.promotedEventId) {
    const ev = await prisma.event.findFirst({
      where: { id: data.promotedEventId, ...orgScope(session), deletedAt: null },
      select: { slug: true, name: true },
    });
    if (ev) promoted = ev;
  }

  const recipients = await marketingAudience(orgId);
  if (recipients.length === 0) redirect(`/dashboard/marketing?error=no_recipients`);

  const campaign = await prisma.marketingCampaign.create({
    data: {
      organizationId: orgId,
      subject: data.subject,
      bodyHtml: renderMarketing(data.body, org, promoted, "", ""),
      bodyText: data.body,
      promotedEventId: promoted ? data.promotedEventId : null,
      recipientsCount: 0,
    },
  });

  const client = resend();
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    // Per-recipient unsubscribe token — signed (org, email), never expires.
    // Footer link → human confirmation page; header → one-click POST endpoint.
    const token = await signUnsubscribeToken({ organizationId: orgId, email: r.email });
    const unsubUrl = `${SITE}/unsubscribe/${token}`;
    const oneClickUrl = `${SITE}/api/unsubscribe/${token}`;
    const html = renderMarketing(data.body, org, promoted, r.firstName ?? "", unsubUrl);
    try {
      if (!client) throw new Error("RESEND_API_KEY not set");
      const res = await client.emails.send({
        from: DEFAULT_FROM,
        to: r.email,
        subject: data.subject,
        html,
        // RFC 8058 one-click unsubscribe — Gmail/Apple show a native
        // "Unsubscribe" control and POST to this URL.
        headers: {
          "List-Unsubscribe": `<${oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await prisma.emailLog.create({
        data: {
          toEmail: r.email,
          kind: "ORGANIZER_BLAST",
          subject: data.subject,
          status: res.data?.id ? "SENT" : "FAILED",
          providerId: res.data?.id ?? null,
          sentAt: new Date(),
        },
      });
      if (res.data?.id) sent++;
      else failed++;
    } catch (e: any) {
      await prisma.emailLog.create({
        data: {
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

  await prisma.marketingCampaign.update({
    where: { id: campaign.id },
    data: { sentAt: new Date(), recipientsCount: sent },
  });
  await audit({
    organizationId: orgId,
    userId: session.sub,
    action: "marketing.send",
    targetType: "MarketingCampaign",
    targetId: campaign.id,
    metadata: { subject: data.subject, sent, failed, audience: recipients.length },
  });

  revalidatePath("/dashboard/marketing");
  redirect(`/dashboard/marketing?sent=${sent}`);
}

function renderMarketing(
  body: string,
  org: any,
  promoted: { slug: string; name: string } | null,
  firstName: string,
  unsubUrl: string,
): string {
  const brand = typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor) ? org.brandColor : "#1F3A8A";
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${esc(org.name)}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";
  const greeting = firstName ? `Hi ${esc(firstName)},` : "Hi,";
  const looksLikeHtml = body.includes("<") && body.includes(">");
  const formattedBody = looksLikeHtml ? body : body.replace(/\n/g, "<br>");
  const cta = promoted
    ? `<p style="margin-top:28px"><a href="${SITE}/o/${esc(org.slug)}/events/${esc(promoted.slug)}" style="display:inline-block;background:${brand};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">View ${esc(promoted.name)}</a></p>`
    : "";

  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
    <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
      <tr><td>
        ${logo}
        <p style="color:#0f172a;margin:0 0 8px">${greeting}</p>
        <div style="color:#0f172a;line-height:1.6">${formattedBody}</div>
        ${cta}
      </td></tr>
    </table>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;line-height:1.6">
      Sent by ${esc(org.name)} via Your Events App.<br>
      You&rsquo;re receiving this because you registered for an event by ${esc(org.name)}.<br>
      ${unsubUrl ? `<a href="${unsubUrl}" style="color:#94a3b8;text-decoration:underline">Unsubscribe from ${esc(org.name)}</a>` : ""}
    </p>
  </body></html>`;
}
