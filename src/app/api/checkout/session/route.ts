import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

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

  // Sanity check before talking to Stripe
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
  const unitAmount = Math.round((reg.totalCents - reg.feeCents - reg.taxCents) / reg.quantity);
  if (unitAmount <= 0) {
    console.error("[checkout] computed unit_amount is non-positive", { totalCents: reg.totalCents, feeCents: reg.feeCents, taxCents: reg.taxCents, quantity: reg.quantity });
    return NextResponse.json({
      error: "Ticket amount is invalid. Please contact the organizer.",
    }, { status: 400 });
  }

  // Build the org-scoped success/cancel URLs (legacy /events/[slug] still 307-redirects)
  const orgSlug = reg.event.organization?.slug ?? "_";
  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/success?reg=${reg.id}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/register`;

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
      metadata: { registrationId: reg.id, eventId: reg.eventId },
      payment_intent_data: { metadata: { registrationId: reg.id } },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await prisma.registration.update({
      where: { id: reg.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    // Stripe API errors carry a `.message` we want to surface to the user (and log fully server-side)
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
