import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { connectChargeParams, canAcceptPayments, platformFeeCents, PLATFORM_FEE_PERCENT } from "@/lib/connect";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reserveSeats } from "@/server/tickets";

/**
 * Full-series bundle checkout: one payment buys a seat in EVERY remaining
 * session of a bounded series. Creates one SeriesBundlePurchase + one PENDING
 * Registration per session (each carrying its per-session share of the price —
 * remainder cents land on the first session so the shares sum exactly), then a
 * single Stripe Checkout session for the total. The webhook confirms all of
 * them atomically on payment.
 *
 * Money design: because each registration's share becomes its own Payment row,
 * per-session refunds and the per-event payout-hold release work unchanged.
 */
const schema = z.object({
  seriesId: z.string().min(1),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const rl = await rateLimit(`bundle:${clientIp(req)}`, 10, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many attempts — try again shortly." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check your name and email and try again." }, { status: 400 });
  const input = parsed.data;
  const email = input.email.trim().toLowerCase();

  const series = await prisma.eventSeries.findFirst({
    where: { id: input.seriesId, deletedAt: null, status: "ACTIVE" },
    include: { organization: true },
  });
  if (!series) return NextResponse.json({ error: "This series is no longer available." }, { status: 410 });
  if (!series.bundlePriceCents || series.bundlePriceCents <= 0) {
    return NextResponse.json({ error: "This series doesn't offer a full-series pass." }, { status: 400 });
  }
  // Bundles only exist on bounded series — "every remaining session" must be a
  // finite, fully-materialized set. (occurrenceCap/seriesEnd series are always
  // fully generated once inside the worker horizon.)
  if (!series.seriesEnd && series.occurrenceCap == null) {
    return NextResponse.json({ error: "This series doesn't offer a full-series pass." }, { status: 400 });
  }

  const org = series.organization;
  if (!org || org.deletedAt || !canAcceptPayments(org)) {
    return NextResponse.json({ error: "This organizer hasn't finished setting up payments yet." }, { status: 503 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payments are not configured for this site." }, { status: 503 });
  }

  const now = new Date();
  const sessions = await prisma.event.findMany({
    where: { seriesId: series.id, deletedAt: null, status: "PUBLISHED", startAt: { gte: now } },
    orderBy: { startAt: "asc" },
    include: { ticketTypes: { where: { isVendorTier: false }, orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  if (sessions.length < 2) {
    return NextResponse.json({ error: "Not enough upcoming sessions left for a full-series pass — register per session instead." }, { status: 400 });
  }
  if (sessions.some((s) => s.ticketTypes.length === 0)) {
    return NextResponse.json({ error: "This series isn't ready for purchase yet. Try again later." }, { status: 409 });
  }

  // One seat per session, same email — the (eventId,email) unique constraint
  // also enforces this, but pre-check to return a friendly message instead of
  // a 500 (e.g. they already bought a drop-in for one date).
  const existing = await prisma.registration.count({
    where: { eventId: { in: sessions.map((s) => s.id) }, email, status: { in: ["PENDING", "CONFIRMED"] } },
  });
  if (existing > 0) {
    return NextResponse.json({ error: "You're already registered for one of these sessions with this email. Contact the organizer to switch to the full-series pass." }, { status: 409 });
  }

  // Per-session share: divide the bundle across sessions, remainder cents on
  // the first so the shares sum exactly to the bundle price.
  const total = series.bundlePriceCents;
  const n = sessions.length;
  const baseShare = Math.floor(total / n);
  const shares = sessions.map((_, i) => (i === 0 ? total - baseShare * (n - 1) : baseShare));

  // Create the purchase + one PENDING registration per session, reserving each
  // seat, all-or-nothing. Sold-out sessions abort the whole bundle.
  let purchaseId: string;
  try {
    purchaseId = await prisma.$transaction(async (tx) => {
      const purchase = await tx.seriesBundlePurchase.create({
        data: {
          seriesId: series.id,
          organizationId: series.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone ?? null,
          totalCents: total,
          sessionCount: n,
        },
      });
      for (let i = 0; i < n; i++) {
        const s = sessions[i];
        const tt = s.ticketTypes[0];
        if (!(await reserveSeats(tx, tt.id, 1))) {
          throw new Error("SOLD_OUT");
        }
        await tx.registration.create({
          data: {
            eventId: s.id,
            ticketTypeId: tt.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email,
            phone: input.phone ?? null,
            quantity: 1,
            subtotalCents: shares[i],
            totalCents: shares[i],
            currency: "USD",
            status: "PENDING",
            bundlePurchaseId: purchase.id,
            accessToken: crypto.randomBytes(24).toString("base64url"),
            ipAddress: clientIp(req),
          },
        });
      }
      return purchase.id;
    });
  } catch (e: any) {
    if (e?.message === "SOLD_OUT") {
      return NextResponse.json({ error: "One of the sessions is sold out, so the full-series pass isn't available. You can still register for individual sessions." }, { status: 409 });
    }
    console.error("[bundle-checkout] create failed:", e?.message);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 500 });
  }

  // Single Stripe Checkout for the bundle total; 5% platform fee on the sale.
  const appFee = platformFeeCents(total);
  const connect = connectChargeParams(org, total);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const successUrl = `${base}/o/${org.slug}/series/${series.slug}?purchased=1`;
  const cancelUrl = `${base}/o/${org.slug}/series/${series.slug}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: total,
          product_data: {
            name: `${series.name} — full series (${n} sessions)`,
            description: `One seat in every remaining session · Bundle ${purchaseId}`,
          },
        },
      }],
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        bundlePurchaseId: purchaseId,
        seriesId: series.id,
        organizationId: org.id,
        platformFeePercent: String(PLATFORM_FEE_PERCENT),
        platformFeeCents: String(appFee),
      },
      payment_intent_data: {
        metadata: { bundlePurchaseId: purchaseId, organizationId: org.id },
        ...(connect ?? {}),
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    // Stamp the session on the purchase AND every registration so the existing
    // abandoned-cart purge can expire/release them exactly like normal regs.
    await prisma.seriesBundlePurchase.update({ where: { id: purchaseId }, data: { stripeSessionId: session.id } });
    await prisma.registration.updateMany({ where: { bundlePurchaseId: purchaseId }, data: { stripeSessionId: session.id } });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[bundle-checkout] Stripe error:", e?.message);
    return NextResponse.json({ error: "Couldn't start checkout right now. Please try again in a moment." }, { status: 502 });
  }
}
