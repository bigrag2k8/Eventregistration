"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { stripe, stripeConfigured } from "@/lib/stripe";

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
  if (!hasTicketTypes) throw new Error("Add at least one ticket type before publishing");
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
  const data = basicsSchema.parse(Object.fromEntries(formData.entries()));
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
      vendorRegistrationEnabled: data.vendorRegistrationEnabled === "1",
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

export async function addTicketTypeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const data = ttSchema.parse(Object.fromEntries(formData.entries()));
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
      throw new Error(
        "Set up payouts (Settings → Payouts) before adding paid ticket types. Free tiers are still allowed.",
      );
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
  if (tt.quantitySold > 0) throw new Error("Ticket type has registrations — cannot delete");
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
  if (reg.status === "CANCELLED") return;

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "organizer_cancel" },
    }),
    prisma.ticket.updateMany({
      where: { registrationId: reg.id },
      data: { isValid: false, invalidatedAt: new Date(), invalidReason: "registration_cancelled" },
    }),
    prisma.ticketType.update({
      where: { id: reg.ticketTypeId },
      data: { quantitySold: { decrement: reg.quantity } },
    }),
  ]);

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

  // Only decrement if it was counting against the sold count
  const wasActive = reg.status !== "CANCELLED";

  await prisma.$transaction([
    prisma.registration.delete({ where: { id: reg.id } }),
    ...(wasActive
      ? [prisma.ticketType.update({
          where: { id: reg.ticketTypeId },
          data: { quantitySold: { decrement: reg.quantity } },
        })]
      : []),
  ]);

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
 * Refund a paid registration through Stripe Connect.
 *
 * With Destination Charges (Phase B), the original payment had:
 *   - application_fee_amount = our 3.5% platform cut
 *   - transfer_data.destination = the organizer's connected account
 *
 * On refund we set:
 *   - reverse_transfer: true          → claw the funds back from the connected
 *                                       account (otherwise the organizer keeps
 *                                       the money and we're out the refund)
 *   - refund_application_fee: true    → also refund our 3.5% fee proportionally
 *                                       so the customer is made whole
 *
 * Stripe's `charge.refunded` webhook fires after this and the existing handler
 * updates Payment.status + Registration.status + invalidates tickets.
 */
export async function refundRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  if (!stripeConfigured) throw new Error("Stripe is not configured.");

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
    include: { payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!reg) throw new Error("Registration not found");
  if (reg.status === "REFUNDED") return; // idempotent
  const payment = reg.payments[0];
  if (!payment?.stripePaymentIntentId) {
    throw new Error("No completed payment found for this registration.");
  }

  try {
    await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { registrationId: reg.id, eventId: event.id, refundedBy: session.sub },
    });
  } catch (e: any) {
    console.error("[refund] Stripe error:", { type: e?.type, code: e?.code, message: e?.message });
    throw new Error(e?.message ?? "Refund failed. Please try again.");
  }

  // The webhook will flip Payment/Registration to REFUNDED and invalidate tickets.
  // We DO write the audit row immediately for the organizer dashboard.
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.refund",
    targetType: "Registration", targetId: reg.id,
    metadata: {
      attendee: `${reg.firstName} ${reg.lastName}`,
      email: reg.email,
      amountCents: payment.amountCents,
      paymentIntent: payment.stripePaymentIntentId,
    },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
}
