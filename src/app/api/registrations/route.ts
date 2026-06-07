import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { computeTotals } from "@/server/pricing";
import { issueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

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

  // Duplicate email per event
  const dupe = await prisma.registration.findUnique({
    where: { eventId_email: { eventId: event.id, email: input.email } },
  });
  if (dupe && dupe.status !== "CANCELLED") {
    return NextResponse.json({
      error: "This email is already registered for this event. Check your inbox for your ticket, or use a different email.",
      fieldErrors: { email: ["Already registered for this event"] },
    }, { status: 409 });
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

  const reg = await prisma.registration.create({
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
      answers: input.answers
        ? { create: input.answers.map((a) => ({ questionId: a.questionId, answer: a.answer })) }
        : undefined,
    },
  });

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

  return NextResponse.json({ id: reg.id, status: reg.status });
}
