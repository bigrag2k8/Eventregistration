import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { finalizeVendor } from "@/server/vendors";

const schema = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const app = await prisma.vendorApplication.findUnique({
    where: { paymentLinkToken: parsed.data.token },
    include: { event: true },
  });
  if (!app) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (app.status === "PAID") return NextResponse.json({ status: "PAID" });
  if (app.status !== "APPROVED") return NextResponse.json({ error: "Application is not ready for payment." }, { status: 400 });
  if (app.paymentLinkExpiresAt && new Date() > app.paymentLinkExpiresAt) {
    return NextResponse.json({ error: "This payment link has expired." }, { status: 410 });
  }

  const priceCents = app.quotedPriceCents ?? 0;

  // Free package (sponsorship comp, etc.) → short-circuit straight to PAID + Registration
  if (priceCents === 0) {
    await finalizeVendor(app.id);
    return NextResponse.json({ status: "PAID" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: priceCents,
        product_data: {
          name: `${app.event.name} — Vendor Booth`,
          description: app.companyName,
        },
      },
    }],
    customer_email: app.email,
    // Include the Stripe session id so the success page can verify payment
    // synchronously instead of waiting for the webhook (which usually lands
    // a few seconds after the redirect — that race condition was making
    // the page show the payment form again).
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/vendor/checkout/${app.paymentLinkToken}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/vendor/checkout/${app.paymentLinkToken}?cancelled=1`,
    metadata: { vendorApplicationId: app.id, eventId: app.eventId },
    payment_intent_data: { metadata: { vendorApplicationId: app.id } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return NextResponse.json({ url: session.url });
}
