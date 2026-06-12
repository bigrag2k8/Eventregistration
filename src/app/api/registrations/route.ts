import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { computeTotals } from "@/server/pricing";
import { issueTickets, releaseSeats, releasePromoUse } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

/** Thrown inside the reservation transaction when seats can't be claimed. */
class SoldOutError extends Error {
  constructor(public scope: "ticket" | "capacity") {
    super(scope);
  }
}

/** Thrown inside the reservation transaction when the promo code's usage limit is exhausted. */
class PromoExhaustedError extends Error {}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  jobTitle: "Job title",
  ticketTypeId: "Ticket type",
  quantity: "Quantity",
  eventId: "Event",
  promoCode: "Promo code",
};
function humanFieldName(k: string) {
  return FIELD_LABELS[k] ?? k;
}

const schema = z.object({
  eventId: z.string(),
  ticketTypeId: z.string(),
  quantity: z.number().int().min(1).max(20),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  dietary: z.string().optional(),
  accessibility: z.string().optional(),
  specialRequests: z.string().optional(),
  promoCode: z.string().optional(),
  referralCode: z.string().optional(),
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })).optional(),
});

/**
 * Creates a registration.
 * - If total = 0: status = CONFIRMED, issue tickets, send email immediately.
 * - Otherwise: status = PENDING; client must follow up with /api/checkout/session.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = flat.fieldErrors as Record<string, string[]>;
    const firstField = Object.keys(fieldErrors)[0];
    const message = firstField
      ? `${humanFieldName(firstField)}: ${fieldErrors[firstField][0]}`
      : "Please fill in all required fields correctly.";
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }
  const input = parsed.data;

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: { ticketTypes: true, promoCodes: true, organization: true },
  });
  if (!event || event.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This event is no longer available." }, { status: 404 });
  }

  // Duplicate email per event:
  // - CONFIRMED: block (don't overwrite a real registration)
  // - REFUNDED / PARTIALLY_REFUNDED: block (refunded registrations shouldn't be re-used)
  // - PENDING (abandoned checkout) or CANCELLED: delete the old row so the new INSERT can succeed
  const dupe = await prisma.registration.findUnique({
    where: { eventId_email: { eventId: event.id, email: input.email } },
  });
  if (dupe) {
    if (dupe.status === "CONFIRMED") {
      return NextResponse.json({
        error: "This email is already registered for this event. Check your inbox for your ticket, or use a different email.",
        fieldErrors: { email: ["Already registered for this event"] },
      }, { status: 409 });
    }
    if (dupe.status === "REFUNDED" || dupe.status === "PARTIALLY_REFUNDED") {
      return NextResponse.json({
        error: "A refunded registration exists with this email. Please contact the organizer or use a different email.",
        fieldErrors: { email: ["Previously refunded — contact organizer"] },
      }, { status: 409 });
    }
    // PENDING / CANCELLED → cascade delete the old row to free the (eventId, email) unique slot.
    if (dupe.status === "PENDING") {
      // Expire its Stripe session first so the orphaned session can't be paid
      // against a registration that no longer exists (the webhook auto-refunds
      // if one slips through), and release the seat it was holding.
      if (dupe.stripeSessionId) {
        try {
          await stripe.checkout.sessions.expire(dupe.stripeSessionId);
        } catch {
          // already expired/completed — webhook orphan-refund is the backstop
        }
      }
      await releaseSeats(prisma, dupe.ticketTypeId, dupe.quantity);
      await releasePromoUse(prisma, dupe.promoCodeId);
    }
    await prisma.registration.delete({ where: { id: dupe.id } }).catch(() => {});
  }

  const totals = await computeTotals({
    event,
    ticketTypeId: input.ticketTypeId,
    quantity: input.quantity,
    promoCode: input.promoCode,
  });
  if ("error" in totals && totals.error) {
    // pricing errors are human-readable already
    const msg = totals.error;
    const fieldHints: Record<string, string[]> = {};
    if (msg.includes("promo")) fieldHints.promoCode = [msg];
    return NextResponse.json({ error: msg, fieldErrors: fieldHints }, { status: 400 });
  }

  // Reserve the seats and create the registration in one transaction so the
  // inventory claim and the row are all-or-nothing. The conditional UPDATE makes
  // overselling impossible: two buyers of the last seat can't both succeed.
  let reg;
  try {
    reg = await prisma.$transaction(async (tx) => {
      // Serialize concurrent reservations for this event so the capacity sum
      // below can't be raced by simultaneous buyers of other ticket types.
      await tx.$executeRaw`SELECT id FROM events WHERE id = ${event.id} FOR UPDATE`;

      // Per-ticket-type claim. Affected-row count of 0 means it didn't fit.
      const reserved = await tx.$executeRaw`
        UPDATE ticket_types
        SET "quantitySold" = "quantitySold" + ${input.quantity}
        WHERE id = ${input.ticketTypeId}
          AND ("quantityTotal" IS NULL OR "quantitySold" + ${input.quantity} <= "quantityTotal")
      `;
      if (reserved === 0) throw new SoldOutError("ticket");

      // Event-wide capacity across all ticket types.
      if (event.capacity != null) {
        const rows = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT COALESCE(SUM("quantitySold"), 0)::bigint AS total
          FROM ticket_types WHERE "eventId" = ${event.id}
        `;
        if (Number(rows[0].total) > event.capacity) throw new SoldOutError("capacity");
      }

      // Claim a promo-code use atomically. Pricing pre-checked usageCount, but
      // only this conditional increment makes the limit race-proof. Released on
      // abandon/cancel/dupe-replace/full-refund, mirroring seats.
      if (totals.promoCodeId) {
        const claimed = await tx.$executeRaw`
          UPDATE promo_codes
          SET "usageCount" = "usageCount" + 1
          WHERE id = ${totals.promoCodeId}
            AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
        `;
        if (claimed === 0) throw new PromoExhaustedError();
      }

      return tx.registration.create({
        data: {
          eventId: event.id,
          ticketTypeId: input.ticketTypeId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          company: input.company,
          jobTitle: input.jobTitle,
          dietary: input.dietary,
          accessibility: input.accessibility,
          specialRequests: input.specialRequests,
          quantity: input.quantity,
          subtotalCents: totals.subtotal,
          discountCents: totals.discount,
          taxCents: totals.tax,
          feeCents: totals.fee,
          totalCents: totals.total,
          currency: totals.currency,
          promoCodeId: totals.promoCodeId,
          status: totals.total === 0 ? "CONFIRMED" : "PENDING",
          confirmedAt: totals.total === 0 ? new Date() : null,
          // Secret for retrieving tickets on the success page / ICS download —
          // possession of the (guessable-ish) registration id alone is not enough.
          accessToken: crypto.randomBytes(24).toString("base64url"),
          answers: input.answers
            ? { create: input.answers.map((a) => ({ questionId: a.questionId, answer: a.answer })) }
            : undefined,
        },
      });
    });
  } catch (e: any) {
    if (e instanceof SoldOutError) {
      return NextResponse.json({
        error: e.scope === "capacity"
          ? "This event just sold out."
          : "Not enough tickets remaining for that ticket type.",
      }, { status: 409 });
    }
    if (e instanceof PromoExhaustedError) {
      return NextResponse.json({
        error: "Promo code usage limit reached",
        fieldErrors: { promoCode: ["Promo code usage limit reached"] },
      }, { status: 409 });
    }
    if (e?.code === "P2002") {
      // A concurrent submission with the same email won the unique slot.
      return NextResponse.json({
        error: "This email is already registered for this event. Check your inbox for your ticket, or use a different email.",
        fieldErrors: { email: ["Already registered for this event"] },
      }, { status: 409 });
    }
    throw e;
  }

  if (reg.status === "CONFIRMED") {
    try {
      await issueTickets(reg.id);
    } catch (e) {
      console.error("[registrations] issueTickets failed", e);
    }
    try {
      await sendConfirmationEmail(reg.id);
    } catch (e) {
      // Non-fatal — confirmation page still works, user can re-request email later
      console.error("[registrations] sendConfirmationEmail failed (likely missing RESEND_API_KEY):", e);
    }
  }

  return NextResponse.json({ id: reg.id, status: reg.status, key: reg.accessToken });
}
