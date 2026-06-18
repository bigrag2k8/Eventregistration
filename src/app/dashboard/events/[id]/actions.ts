"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { releaseSeats, releasePromoUse, reissueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

async function authorizeEvent(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...orgScope(session), deletedAt: null },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

export async function publishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  const hasTicketTypes = await prisma.ticketType.count({ where: { eventId: event.id } });
  if (!hasTicketTypes) redirect(`/dashboard/events/${event.id}?error=no_ticket_types`);
  await prisma.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED", publishedAt: event.publishedAt ?? new Date() },
  });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.publish", targetType: "Event", targetId: event.id,
    metadata: { name: event.name, slug: event.slug },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/");
}

export async function unpublishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.unpublish", targetType: "Event", targetId: event.id,
    metadata: { name: event.name },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath("/");
}

/**
 * Re-sign a confirmed registration's QR ticket(s) with the current key and email
 * a fresh confirmation. Recovers tickets after a QR_SECRET rotation (old tokens
 * stop verifying) or simply re-sends a lost ticket. Org-scoped to the caller.
 */
export async function reissueTicketsAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
    select: { id: true, status: true, email: true },
  });
  if (!reg) redirect(`/dashboard/events/${event.id}/registrations?error=reissue_failed`);
  if (reg.status !== "CONFIRMED") {
    redirect(`/dashboard/events/${event.id}/registrations?error=reissue_not_confirmed`);
  }

  // Keep redirects OUT of the try so NEXT_REDIRECT isn't swallowed (H-7).
  let failed = false;
  try {
    await reissueTickets(reg.id);
    await sendConfirmationEmail(reg.id);
  } catch (e: any) {
    console.error("[reissue] failed:", e?.message);
    failed = true;
  }
  if (failed) redirect(`/dashboard/events/${event.id}/registrations?error=reissue_failed`);

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "ticket.reissued", targetType: "Registration", targetId: reg.id,
    metadata: { email: reg.email },
  });
  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  redirect(`/dashboard/events/${event.id}/registrations?reissued=1`);
}

/**
 * Spend one single-event credit to upgrade a FREE event to PREMIUM (unlimited
 * registrations, vendor flow, custom branding, more broadcasts). Conditional
 * decrement so the event is never upgraded without a paid credit. No-op if
 * already premium.
 */
export async function upgradeEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  if (event.isPremium) redirect(`/dashboard/events/${event.id}?saved=1`);

  const claimed = await prisma.organization.updateMany({
    where: { id: event.organizationId, singleEventCredits: { gt: 0 } },
    data: { singleEventCredits: { decrement: 1 } },
  });
  if (claimed.count === 0) redirect(`/dashboard/events/${event.id}?error=no_credits`);

  await prisma.event.update({ where: { id: event.id }, data: { isPremium: true } });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.upgrade_premium", targetType: "Event", targetId: event.id,
    metadata: { name: event.name },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/o/${event.slug}`);
  redirect(`/dashboard/events/${event.id}?upgraded=1`);
}

export async function deleteAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.delete", targetType: "Event", targetId: event.id,
    metadata: { name: event.name, slug: event.slug },
  });
  redirect("/dashboard");
}

const basicsSchema = z.object({
  name: z.string().min(2).max(200),
  shortDescription: z.string().max(160).optional(),
  description: z.string().min(10),
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string().optional(),
  capacity: z.string().optional(),
  contactEmail: z.string().optional(),
  refundPolicy: z.string().optional(),
  vendorRegistrationEnabled: z.string().optional(),
  vendorApplicationNotes: z.string().optional(),
  defaultVendorPrice: z.string().optional(),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  isPrivate: z.string().optional(),
});

export async function updateBasicsAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const parsed = basicsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/dashboard/events/${event.id}?error=validation`);
  const data = parsed.data;
  // Wall-clock input is interpreted in the event's timezone (form value, or
  // the existing one if the form didn't send it), then stored as a UTC instant.
  const tz = data.timezone || event.timezone;
  const startAt = fromZonedTime(data.startAt, tz);
  const endAt = fromZonedTime(data.endAt, tz);
  // Friendly inline error instead of a server-side exception page
  if (endAt <= startAt) {
    redirect(`/dashboard/events/${event.id}?error=date_order`);
  }

  await prisma.event.update({
    where: { id: event.id },
    data: {
      name: data.name,
      shortDescription: data.shortDescription || null,
      description: data.description,
      startAt,
      endAt,
      timezone: tz,
      capacity: data.capacity ? parseInt(data.capacity) : null,
      contactEmail: data.contactEmail || null,
      refundPolicy: data.refundPolicy || null,
      // Vendor flow is a premium feature — a free event can't turn it on.
      vendorRegistrationEnabled: event.isPremium && data.vendorRegistrationEnabled === "1",
      isPrivate: data.isPrivate === "1",
      vendorApplicationNotes: data.vendorApplicationNotes || null,
      defaultVendorPriceCents: data.defaultVendorPrice !== undefined
        ? Math.round(parseFloat(data.defaultVendorPrice || "0") * 100)
        : event.defaultVendorPriceCents,
      // bannerUrl: empty string from the form means "remove image"
      bannerUrl: data.bannerUrl ? data.bannerUrl : null,
    },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
  // Redirect back with ?saved=1 so the page can show a "Changes saved" banner.
  // (Without a redirect, server actions complete silently.)
  redirect(`/dashboard/events/${event.id}?saved=1`);
}

const ttSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.string().default("0"),
  quantity: z.string().optional(),
});

const presaleSchema = z.object({
  presaleEnabled: z.string().optional(),
  presalePercent: z.string().optional(),
  presaleEndsAt: z.string().optional(),
});

/** Enable/disable the event's presale (early-bird) discount. */
export async function updatePresaleAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  const parsed = presaleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/dashboard/events/${event.id}?error=validation`);
  const data = parsed.data;

  const enabled = data.presaleEnabled === "1";
  let presalePercent: number | null = null;
  let presaleEndsAt: Date | null = null;

  if (enabled) {
    // A presale on an event with only free tickets does nothing — refuse it so
    // the organizer isn't left thinking a discount is running.
    const paidTickets = await prisma.ticketType.count({
      where: { eventId: event.id, isVendorTier: false, priceCents: { gt: 0 } },
    });
    if (paidTickets === 0) {
      redirect(`/dashboard/events/${event.id}?error=presale_no_paid_tickets`);
    }
    const pct = parseFloat(data.presalePercent || "");
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      redirect(`/dashboard/events/${event.id}?error=presale_percent`);
    }
    if (!data.presaleEndsAt) {
      redirect(`/dashboard/events/${event.id}?error=presale_date`);
    }
    // Wall-clock expiry is interpreted in the event's timezone, stored as UTC.
    presalePercent = pct;
    presaleEndsAt = fromZonedTime(data.presaleEndsAt!, event.timezone);
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { presalePercent, presaleEndsAt },
  });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.presale_update", targetType: "Event", targetId: event.id,
    metadata: { enabled, presalePercent, presaleEndsAt: presaleEndsAt?.toISOString() ?? null },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  redirect(`/dashboard/events/${event.id}?saved=1`);
}

export async function addTicketTypeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const parsedTt = ttSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsedTt.success) redirect(`/dashboard/events/${event.id}?error=validation`);
  const data = parsedTt.data;
  const priceCents = Math.round(parseFloat(data.price || "0") * 100);
  const qty = data.quantity ? parseInt(data.quantity) : null;

  // Phase B: paid ticket types require the org to be Connect-ready, otherwise
  // we'd accept registrations we can't process at checkout time. Free tiers
  // are always allowed.
  if (priceCents > 0) {
    const org = await prisma.organization.findUnique({
      where: { id: event.organizationId },
      select: { stripeAccountId: true, stripeAccountChargesEnabled: true },
    });
    if (!org?.stripeAccountId || !org.stripeAccountChargesEnabled) {
      redirect(`/dashboard/events/${event.id}?error=payouts_required`);
    }
  }

  const existing = await prisma.ticketType.count({ where: { eventId: event.id } });
  await prisma.ticketType.create({
    data: {
      eventId: event.id,
      name: data.name,
      kind: priceCents === 0 ? "FREE" : "GENERAL",
      priceCents,
      quantityTotal: qty,
      sortOrder: existing,
    },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

export async function deleteTicketTypeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const ticketTypeId = String(formData.get("ticketTypeId"));
  const { event } = await authorizeEvent(eventId);
  const tt = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId: event.id } });
  if (!tt) throw new Error("Not found");
  if (tt.quantitySold > 0) redirect(`/dashboard/events/${event.id}?error=tt_has_regs`);
  await prisma.ticketType.delete({ where: { id: tt.id } });
  revalidatePath(`/dashboard/events/${event.id}`);
}

/**
 * Soft-cancel a registration: status -> CANCELLED, invalidate tickets,
 * decrement ticketType.quantitySold so the seat opens back up.
 * Keeps the row for audit trail. Use deleteRegistrationAction for hard removal.
 */
export async function cancelRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
  });
  if (!reg) throw new Error("Registration not found");
  // Already-released states: cancelling again must not free a seat twice.
  if (reg.status === "CANCELLED" || reg.status === "REFUNDED") return;

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "organizer_cancel" },
    });
    await tx.ticket.updateMany({
      where: { registrationId: reg.id },
      data: { isValid: false, invalidatedAt: new Date(), invalidReason: "registration_cancelled" },
    });
    await releaseSeats(tx, reg.ticketTypeId, reg.quantity);
    await releasePromoUse(tx, reg.promoCodeId);
  });

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.cancel", targetType: "Registration", targetId: reg.id,
    metadata: { attendee: `${reg.firstName} ${reg.lastName}`, email: reg.email, quantity: reg.quantity },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

/**
 * Hard-delete a registration (and its tickets + check-ins via cascade).
 * Use for test data cleanup. Decrements quantitySold so the seat reopens.
 */
export async function deleteRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
  });
  if (!reg) throw new Error("Registration not found");

  // Only release a seat if this reg was still holding one. CANCELLED and
  // (fully) REFUNDED regs already released theirs, so don't double-decrement.
  const wasActive = reg.status !== "CANCELLED" && reg.status !== "REFUNDED";

  await prisma.$transaction(async (tx) => {
    await tx.registration.delete({ where: { id: reg.id } });
    if (wasActive) {
      await releaseSeats(tx, reg.ticketTypeId, reg.quantity);
      await releasePromoUse(tx, reg.promoCodeId);
    }
  });

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.delete", targetType: "Registration", targetId: reg.id,
    metadata: { attendee: `${reg.firstName} ${reg.lastName}`, email: reg.email, quantity: reg.quantity },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

/**
 * Refund a paid registration through Stripe Connect. Organizers always get a
 * net refund (4.5% fee withheld). Only SUPERADMINs may issue a full refund.
 */
export async function refundRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const mode = String(formData.get("mode") ?? "net");
  const { session, event } = await authorizeEvent(eventId);

  const errTo = `/dashboard/events/${event.id}/registrations`;
  if (mode === "full" && session.role !== "SUPERADMIN") redirect(`${errTo}?error=forbidden`);
  if (!stripeConfigured) redirect(`${errTo}?error=stripe_not_configured`);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
    include: { payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!reg) throw new Error("Registration not found");
  if (reg.status === "REFUNDED") return;
  const payment = reg.payments[0];
  if (!payment?.stripePaymentIntentId) {
    redirect(`${errTo}?error=refund_no_payment`);
  }

  const fee = payment.platformFeeCents ?? 0;
  const withholdFee = mode !== "full" && fee > 0;
  const refundAmountCents = withholdFee ? Math.max(payment.amountCents - fee, 1) : payment.amountCents;

  let refundFailed = false;
  try {
    await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reverse_transfer: true,
      refund_application_fee: !withholdFee,
      ...(withholdFee ? { amount: refundAmountCents } : {}),
      metadata: { registrationId: reg.id, eventId: event.id, refundedBy: session.sub, refundMode: withholdFee ? "net" : "full" },
    });
  } catch (e: any) {
    console.error("[refund] Stripe error:", { type: e?.type, code: e?.code, message: e?.message });
    refundFailed = true;
  }
  if (refundFailed) redirect(`${errTo}?error=refund_failed`);

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.refund",
    targetType: "Registration", targetId: reg.id,
    metadata: {
      attendee: `${reg.firstName} ${reg.lastName}`,
      email: reg.email,
      amountCents: payment.amountCents,
      refundedCents: refundAmountCents,
      withheldFeeCents: withholdFee ? fee : 0,
      refundMode: withholdFee ? "net" : "full",
      paymentIntent: payment.stripePaymentIntentId,
    },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
}

/**
 * Bulk-refund multiple registrations. Always net (withholds 4.5% fee) unless
 * the caller is SUPERADMIN and passes mode=full. Processes sequentially so
 * Stripe rate limits aren't hit; skips already-refunded and free registrations.
 * Returns a JSON result string with success/failure counts.
 */
export async function bulkRefundAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const ids = String(formData.get("registrationIds")).split(",").filter(Boolean);
  const mode = String(formData.get("mode") ?? "net");
  const { session, event } = await authorizeEvent(eventId);

  const errTo = `/dashboard/events/${event.id}/registrations`;
  if (mode === "full" && session.role !== "SUPERADMIN") redirect(`${errTo}?error=forbidden`);
  if (!stripeConfigured) redirect(`${errTo}?error=stripe_not_configured`);
  if (ids.length === 0) redirect(errTo);

  const regs = await prisma.registration.findMany({
    where: { id: { in: ids }, eventId: event.id, status: "CONFIRMED" },
    include: { payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const reg of regs) {
    const payment = reg.payments[0];
    if (!payment?.stripePaymentIntentId || reg.totalCents === 0) {
      skipped++;
      continue;
    }

    const fee = payment.platformFeeCents ?? 0;
    const withholdFee = mode !== "full" && fee > 0;
    const refundAmountCents = withholdFee ? Math.max(payment.amountCents - fee, 1) : payment.amountCents;

    try {
      await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        reverse_transfer: true,
        refund_application_fee: !withholdFee,
        ...(withholdFee ? { amount: refundAmountCents } : {}),
        metadata: { registrationId: reg.id, eventId: event.id, refundedBy: session.sub, refundMode: withholdFee ? "net" : "full", bulk: "true" },
      });
      await audit({
        organizationId: event.organizationId, eventId: event.id, userId: session.sub,
        action: "registration.refund",
        targetType: "Registration", targetId: reg.id,
        metadata: {
          attendee: `${reg.firstName} ${reg.lastName}`,
          email: reg.email,
          amountCents: payment.amountCents,
          refundedCents: refundAmountCents,
          withheldFeeCents: withholdFee ? fee : 0,
          refundMode: withholdFee ? "net" : "full",
          paymentIntent: payment.stripePaymentIntentId,
          bulk: true,
        },
      });
      succeeded++;
    } catch (e: any) {
      console.error("[bulk-refund] Stripe error for reg", reg.id, { type: e?.type, code: e?.code, message: e?.message });
      failed++;
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
  redirect(`${errTo}?refunded=${succeeded}&skipped=${skipped}&failed=${failed}`);
}
