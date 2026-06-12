import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { connectChargeParams, canAcceptPayments, PLATFORM_FEE_PERCENT } from "@/lib/connect";

const schema = z.object({ registrationId: z.string() });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const reg = await prisma.registration.findUnique({
    where: { id: parsed.data.registrationId },
    include: { event: { include: { organization: true } }, ticketType: true },
  });
  if (!reg || reg.status !== "PENDING") {
    return NextResponse.json({ error: "Registration not pending" }, { status: 400 });
  }
  // Don't take payment for an event the organizer has cancelled/deleted or an
  // org that's been removed since the registration was created.
  if (reg.event.deletedAt || reg.event.status !== "PUBLISHED" || reg.event.organization?.deletedAt) {
    return NextResponse.json({ error: "This event is no longer available." }, { status: 410 });
  }

  // Sanity checks before talking to Stripe
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[checkout] STRIPE_SECRET_KEY not set");
    return NextResponse.json({
      error: "Payments are not configured for this site. Please contact the organizer.",
    }, { status: 503 });
  }
  if (reg.totalCents <= 0) {
    return NextResponse.json({
      error: "Total is zero — no checkout needed. Please refresh and try again.",
    }, { status: 400 });
  }

  // Connect gating: organizer must have a verified Stripe account before
  // we can accept payments on their behalf. If not, surface a clear error
  // (the event manage page also shows a banner so this should be rare).
  const org = reg.event.organization;
  if (!org || !canAcceptPayments(org)) {
    return NextResponse.json({
      error: "This organizer hasn't finished setting up payments. Please try again later or contact them.",
    }, { status: 503 });
  }

  // Reuse an existing open session rather than minting a second payable one.
  // Two live sessions for one registration can both be paid -> double charge
  // with only one Payment row recorded.
  if (reg.stripeSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(reg.stripeSessionId);
      if (existing.status === "open" && existing.url) {
        return NextResponse.json({ url: existing.url });
      }
    } catch {
      // session not retrievable (expired/garbage) — fall through and create a fresh one
    }
  }

  const unitAmount = Math.round((reg.totalCents - reg.feeCents - reg.taxCents) / reg.quantity);
  if (unitAmount <= 0) {
    console.error("[checkout] computed unit_amount is non-positive", { totalCents: reg.totalCents, feeCents: reg.feeCents, taxCents: reg.taxCents, quantity: reg.quantity });
    return NextResponse.json({
      error: "Ticket amount is invalid. Please contact the organizer.",
    }, { status: 400 });
  }

  // Build the org-scoped success/cancel URLs (legacy /events/[slug] still 307-redirects)
  const orgSlug = org.slug;
  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/success?reg=${reg.id}${reg.accessToken ? `&key=${reg.accessToken}` : ""}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/register`;

  // Connect routing: take PLATFORM_FEE_PERCENT% of the SALE VALUE (subtotal
  // minus discount — NOT tax or the processing fee, which are pass-throughs),
  // route the remainder to the organizer. on_behalf_of makes the customer's
  // statement read as the organizer.
  const feeBaseCents = Math.max(0, reg.subtotalCents - reg.discountCents);
  const connect = connectChargeParams(org, feeBaseCents);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"], // Apple/Google Pay auto-enabled when wallets supported
      line_items: [
        {
          quantity: reg.quantity,
          price_data: {
            currency: reg.currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: `${reg.event.name} — ${reg.ticketType.name}`,
              description: `Registration ${reg.id}`,
            },
          },
        },
        ...(reg.taxCents > 0 ? [{
          quantity: 1,
          price_data: {
            currency: reg.currency.toLowerCase(),
            unit_amount: reg.taxCents,
            product_data: { name: "Tax" },
          },
        }] : []),
        ...(reg.feeCents > 0 ? [{
          quantity: 1,
          price_data: {
            currency: reg.currency.toLowerCase(),
            unit_amount: reg.feeCents,
            product_data: { name: "Processing fee" },
          },
        }] : []),
      ],
      customer_email: reg.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        registrationId: reg.id,
        eventId: reg.eventId,
        organizationId: org.id,
        platformFeePercent: String(PLATFORM_FEE_PERCENT),
      },
      payment_intent_data: {
        metadata: { registrationId: reg.id, organizationId: org.id },
        // Spread the Connect routing into payment_intent_data so the
        // PaymentIntent carries the destination + fee split.
        ...(connect ?? {}),
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await prisma.registration.update({
      where: { id: reg.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[checkout] Stripe error:", {
      type: e?.type,
      code: e?.code,
      message: e?.message,
      raw: e?.raw,
    });
    const friendly = e?.message
      ? `Payment system error: ${e.message}`
      : "Couldn't start checkout right now. Please try again in a moment.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
