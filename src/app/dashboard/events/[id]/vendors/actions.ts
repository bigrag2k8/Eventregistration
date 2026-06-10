"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { Resend } from "resend";
import { audit } from "@/lib/audit";

async function authorize(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...orgScope(session), deletedAt: null },
    include: { organization: true },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM ?? "Your Events App <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function approveVendorAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const appId = String(formData.get("appId"));
  const notes = String(formData.get("notes") ?? "");
  const priceStr = String(formData.get("price") ?? "");

  const { session, event } = await authorize(eventId);

  const app = await prisma.vendorApplication.findFirst({
    where: { id: appId, eventId: event.id },
    include: { ticketType: true },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== "PENDING") throw new Error(`Application is already ${app.status}`);

  // Determine quoted price (cents)
  const quotedPriceCents = priceStr
    ? Math.max(0, Math.round(parseFloat(priceStr) * 100))
    : (event.defaultVendorPriceCents ?? 0);

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.vendorApplication.update({
    where: { id: app.id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: session.sub,
      approvalNotes: notes || null,
      quotedPriceCents,
      paymentLinkToken: token,
      paymentLinkExpiresAt: expiresAt,
    },
  });

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "vendor.approve", targetType: "VendorApplication", targetId: app.id,
    metadata: { company: app.companyName, email: app.email, quotedPriceCents, notes: notes || null },
  });

  // Email vendor with payment link
  const resend = getResend();
  if (resend) {
    const checkoutUrl = `${APP_URL}/vendor/checkout/${token}`;
    const priceText = quotedPriceCents > 0
      ? `$${(quotedPriceCents / 100).toFixed(2)}`
      : "the booth fee (waived)";
    try {
      await resend.emails.send({
        from: FROM,
        to: app.email,
        subject: `Your vendor application for ${event.name} has been approved!`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
            <h1 style="color:#1F3A8A">Approved! 🎉</h1>
            <p>Hi ${app.contactFirstName},</p>
            <p>Great news — your vendor application for <strong>${event.name}</strong> has been approved by ${event.organization.name}.</p>
            ${notes ? `<div style="background:#EFF6FF;border-left:4px solid #1F3A8A;padding:12px 16px;margin:16px 0"><strong>From the organizer:</strong><br>${notes.replace(/\n/g, "<br>")}</div>` : ""}
            <p>To secure your booth, please complete payment of ${priceText} using the link below. This link expires in 7 days.</p>
            <p style="margin:24px 0"><a href="${checkoutUrl}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Complete payment →</a></p>
            <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${checkoutUrl}</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[approveVendor] email send failed:", e);
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}

export async function rejectVendorAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const appId = String(formData.get("appId"));
  const reason = String(formData.get("reason") ?? "");

  const { session, event } = await authorize(eventId);

  const app = await prisma.vendorApplication.findFirst({
    where: { id: appId, eventId: event.id },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== "PENDING") throw new Error(`Application is already ${app.status}`);

  await prisma.vendorApplication.update({
    where: { id: app.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: session.sub,
      rejectionReason: reason || null,
    },
  });

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "vendor.reject", targetType: "VendorApplication", targetId: app.id,
    metadata: { company: app.companyName, email: app.email, reason: reason || null },
  });

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({
        from: FROM,
        to: app.email,
        subject: `Vendor application update — ${event.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
            <h1 style="color:#1F3A8A">Application update</h1>
            <p>Hi ${app.contactFirstName},</p>
            <p>Thanks for your interest in being a vendor at <strong>${event.name}</strong>. Unfortunately we are unable to accept your application at this time.</p>
            ${reason ? `<div style="background:#FEF2F2;border-left:4px solid #B91C1C;padding:12px 16px;margin:16px 0"><strong>Reason:</strong><br>${reason.replace(/\n/g, "<br>")}</div>` : ""}
            <p>We appreciate your interest and wish you the best.</p>
            <p style="color:#64748b">— ${event.organization.name}</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("[rejectVendor] email send failed:", e);
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}

export async function deleteVendorApplicationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const appId = String(formData.get("appId"));
  const { event } = await authorize(eventId);
  await prisma.vendorApplication.deleteMany({ where: { id: appId, eventId: event.id } });
  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}
