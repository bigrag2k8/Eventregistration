"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { audit } from "@/lib/audit";
import { sendRefundRequestDecisionEmail } from "@/lib/email";

async function authorize(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...orgScope(session), deletedAt: null },
    include: { organization: true },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

export async function approveRefundRequestAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const requestId = String(formData.get("requestId"));
  const note = String(formData.get("note") ?? "");
  const { session, event } = await authorize(eventId);
  const basePath = `/dashboard/events/${event.id}/refund-requests`;

  const request = await prisma.refundRequest.findFirst({
    where: { id: requestId, eventId: event.id, status: "OPEN" },
    include: {
      registration: {
        include: { payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!request) redirect(`${basePath}?error=not_found`);

  const reg = request.registration;
  const payment = reg.payments[0];

  if (!payment?.stripePaymentIntentId || !stripeConfigured) {
    await prisma.refundRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedBy: session.sub,
        reviewedAt: new Date(),
        // reviewNote is customer-visible (shown in the decision email); keep it
        // to the organizer's actual words, not an internal placeholder.
        reviewNote: note || null,
      },
    });
    // Keep the email OUTSIDE any try that also wraps redirect() — redirect
    // throws a control-flow signal that must propagate.
    try {
      await sendRefundRequestDecisionEmail(request.id, "approved");
    } catch (e) {
      console.error("[refund-request/approve] attendee notification failed", e);
    }
    redirect(basePath);
  }

  // Refund principle: whoever breaks the commitment bears the cost. A
  // reschedule is the ORGANIZER moving the date, so attendees who registered
  // BEFORE the date change get a FULL refund including the platform fee —
  // matching the reschedule email's "request a full refund" promise. Everyone
  // else (attendee's own reasons, never-rescheduled event) follows the
  // standard net policy: fee non-refundable, as disclosed at checkout.
  const rescheduleCaused = !!event.rescheduledAt && reg.createdAt < event.rescheduledAt;
  const fee = payment.platformFeeCents ?? 0;
  const fullRefund = rescheduleCaused || fee === 0;
  const refundAmountCents = fullRefund ? payment.amountCents : Math.max(payment.amountCents - fee, 1);

  let refundFailed = false;
  try {
    await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reverse_transfer: true,
      refund_application_fee: fullRefund && fee > 0,
      amount: refundAmountCents,
      metadata: {
        registrationId: reg.id,
        eventId: event.id,
        refundedBy: session.sub,
        refundMode: fullRefund ? "full_reschedule" : "net",
        refundRequestId: request.id,
      },
    });
  } catch (e: any) {
    console.error("[refund-request/approve] Stripe error:", e?.message);
    refundFailed = true;
  }

  if (refundFailed) redirect(`${basePath}?error=refund_failed`);

  await prisma.$transaction([
    prisma.refundRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedBy: session.sub,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
    }),
    prisma.registration.update({
      where: { id: reg.id },
      data: { status: "REFUNDED" },
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", refundedAmountCents: refundAmountCents },
    }),
  ]);

  await audit({
    organizationId: event.organizationId,
    eventId: event.id,
    userId: session.sub,
    action: "refund_request.approve",
    targetType: "RefundRequest",
    targetId: request.id,
    metadata: {
      registrationId: reg.id,
      attendee: `${reg.firstName} ${reg.lastName}`,
      email: reg.email,
      amountCents: payment.amountCents,
      refundedCents: refundAmountCents,
      withheldFeeCents: fullRefund ? 0 : fee,
      refundMode: fullRefund ? "full_reschedule" : "net",
    },
  });

  try {
    await sendRefundRequestDecisionEmail(request.id, "approved", { refundedCents: refundAmountCents, full: fullRefund });
  } catch (e) {
    console.error("[refund-request/approve] attendee notification failed", e);
  }

  revalidatePath(basePath);
  revalidatePath(`/dashboard/events/${event.id}/registrations`);
}

export async function denyRefundRequestAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const requestId = String(formData.get("requestId"));
  const note = String(formData.get("note") ?? "");
  const { session, event } = await authorize(eventId);
  const basePath = `/dashboard/events/${event.id}/refund-requests`;

  const request = await prisma.refundRequest.findFirst({
    where: { id: requestId, eventId: event.id, status: "OPEN" },
  });
  if (!request) redirect(`${basePath}?error=not_found`);

  await prisma.refundRequest.update({
    where: { id: request.id },
    data: {
      status: "DENIED",
      reviewedBy: session.sub,
      reviewedAt: new Date(),
      reviewNote: note || null,
    },
  });

  await audit({
    organizationId: event.organizationId,
    eventId: event.id,
    userId: session.sub,
    action: "refund_request.deny",
    targetType: "RefundRequest",
    targetId: request.id,
    metadata: { registrationId: request.registrationId, note: note || null },
  });

  try {
    await sendRefundRequestDecisionEmail(request.id, "denied");
  } catch (e) {
    console.error("[refund-request/deny] attendee notification failed", e);
  }

  revalidatePath(basePath);
}
