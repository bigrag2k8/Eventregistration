import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { connectChargeParams, canAcceptPayments, recurringDropInFeeCents, PLATFORM_FEE_PERCENT } from "@/lib/connect";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// F-02: `key` is the registration's secret accessToken. Checkout runs before
// any login (the buyer may have no account), so ownership is proven by this
// per-registration token — the same one the confirmation/ICS/success links use
// — rather than a session. Without it the endpoint let anyone create a Stripe
// session for, and clobber the stripeSessionId of, any PENDING registration id.
const schema = z.object({ registrationId: z.string(), key: z.string().min(1) });

export async function POST(req: Request) {
  // F-02: throttle per source IP BEFORE any DB/Stripe work, so probing ids or
  // hammering session-create can't run up load. Generous limit so a shared
  // venue/NAT IP registering many attendees isn't falsely blocked; the token
  // check above is the real ownership gate. Rightmost-XFF IP is proxy-trusted.
  const ip = clientIp(req);
  const rl = await rateLimit(`checkout-session:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) } },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const reg = await prisma.registration.findUnique({
    where: { id: parsed.data.registrationId },
    include: {
      event: { include: { organization: true } },
      ticketType: true,
      items: { include: { ticketType: true } },
    },
  });
  // Prove ownership via the accessToken before anything else. Fail closed on a
  // missing/blank token and answer 404 (not 403) so an attacker can't use this
  // to confirm which registration ids exist. Placed before the status check so
  // pending-vs-not isn't leakable either.
  if (!reg || !reg.accessToken || parsed.data.key !== reg.accessToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (reg.status !== "PENDING") {
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

  // The ticket line is the exact discounted subtotal (= sale value), billed as
  // ONE line item with the quantity in the description. Charging unit_amount ×
  // quantity instead loses a few cents to rounding whenever a discount doesn't
  // divide evenly, drifting Stripe's total away from reg.totalCents.
  const feeBaseCents = Math.max(0, reg.subtotalCents - reg.discountCents);
  if (feeBaseCents <= 0) {
    console.error("[checkout] computed ticket amount is non-positive", { subtotalCents: reg.subtotalCents, discountCents: reg.discountCents });
    return NextResponse.json({
      error: "Ticket amount is invalid. Please contact the organizer.",
    }, { status: 400 });
  }

  // Build the org-scoped success/cancel URLs (legacy /events/[slug] still 307-redirects)
  const orgSlug = org.slug;
  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/success?reg=${reg.id}${reg.accessToken ? `&key=${reg.accessToken}` : ""}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}/register`;

  // Connect routing: take PLATFORM_FEE_PERCENT% of the sale value (feeBaseCents
  // above — NOT tax or the processing fee, which are pass-throughs), route the
  // remainder to the organizer. on_behalf_of makes the customer's statement
  // read as the organizer. Recurring-series occurrences get the capped drop-in
  // fee (min $1.25 never exceeds 10% of the ticket).
  const feeOverride = reg.event.recurringEventId ? recurringDropInFeeCents(feeBaseCents) : undefined;
  const connect = connectChargeParams(org, feeBaseCents, feeOverride);

  const currency = reg.currency.toLowerCase();
  // Ticket line(s). A combined multi-pass order shows one line per pass for a
  // clear receipt — but ONLY when there's no cart-wide discount, so the line
  // sum equals feeBaseCents exactly (the passes' list prices sum to the
  // subtotal). With a discount (presale/promo applies to the whole cart, not a
  // single line), fall back to the single combined line at feeBaseCents to keep
  // Stripe's total exactly on reg.totalCents — the same rounding-safe approach a
  // single ticket uses.
  const ticketLines =
    reg.items.length && reg.discountCents === 0
      ? reg.items.map((it) => ({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: it.unitPriceCents * it.quantity,
            product_data: {
              name: `${reg.event.name} — ${it.ticketType.name}`,
              description: `${it.quantity > 1 ? `${it.quantity} × ` : ""}${it.ticketType.name} · Reg ${reg.id}`,
            },
          },
        }))
      : [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: feeBaseCents,
            product_data: {
              name: reg.items.length ? `${reg.event.name} — conference passes` : `${reg.event.name} — ${reg.ticketType.name}`,
              description: reg.items.length
                ? `${reg.items.map((i) => i.ticketType.name).join(", ")}${reg.discountCents > 0 ? " (discount applied)" : ""} · Reg ${reg.id}`
                : `${reg.quantity} × ${reg.ticketType.name}${reg.discountCents > 0 ? " (discount applied)" : ""} · Reg ${reg.id}`,
            },
          },
        }];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"], // Apple/Google Pay auto-enabled when wallets supported
      line_items: [
        ...ticketLines,
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
        // Exact application fee applied to this charge, persisted on the Payment
        // row by the webhook so platform earnings are queryable without Stripe.
        platformFeeCents: String(connect?.application_fee_amount ?? 0),
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
