import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { issueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

const schema = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const app = await prisma.vendorApplication.findUnique({
    where: { paymentLinkToken: parsed.data.token },
    include: { event: true, ticketType: true },
  });
  if (!app) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (app.status === "PAID") return NextResponse.json({ status: "PAID" });
  if (app.status !== "APPROVED") return NextResponse.json({ error: "Application is not ready for payment." }, { status: 400 });
  if (app.paymentLinkExpiresAt && new Date() > app.paymentLinkExpiresAt) {
    return NextResponse.json({ error: "This payment link has expired." }, { status: 410 });
  }
  if (!app.ticketType) return NextResponse.json({ error: "No vendor package linked. Contact the organizer." }, { status: 400 });

  const priceCents = app.ticketType.priceCents;

  // If the package is free (sponsorship comp, etc.), short-circuit straight to PAID + Registration
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
        currency: app.ticketType.currency.toLowerCase(),
        unit_amount: priceCents,
        product_data: {
          name: `${app.event.name} — ${app.ticketType.name} (Vendor)`,
          description: app.companyName,
        },
      },
    }],
    customer_email: app.email,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/vendor/checkout/${app.paymentLinkToken}?paid=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/vendor/checkout/${app.paymentLinkToken}`,
    metadata: { vendorApplicationId: app.id, eventId: app.eventId },
    payment_intent_data: { metadata: { vendorApplicationId: app.id } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return NextResponse.json({ url: session.url });
}

async function finalizeVendor(appId: string) {
  const app = await prisma.vendorApplication.findUnique({
    where: { id: appId }, include: { ticketType: true },
  });
  if (!app || !app.ticketType) return;

  const reg = await prisma.registration.create({
    data: {
      eventId: app.eventId,
      ticketTypeId: app.ticketTypeId!,
      firstName: app.contactFirstName,
      lastName: app.contactLastName,
      email: app.email,
      phone: app.phone,
      company: app.companyName,
      quantity: 1,
      subtotalCents: app.ticketType.priceCents,
      totalCents: app.ticketType.priceCents,
      currency: app.ticketType.currency,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
  await prisma.ticketType.update({
    where: { id: app.ticketTypeId! },
    data: { quantitySold: { increment: 1 } },
  });
  await prisma.vendorApplication.update({
    where: { id: app.id },
    data: { status: "PAID", paidAt: new Date(), registrationId: reg.id },
  });
  try { await issueTickets(reg.id); } catch (e) { console.error("[vendor] issueTickets failed:", e); }
  try { await sendConfirmationEmail(reg.id); } catch (e) { console.error("[vendor] confirmation email failed:", e); }
}

// Export for the Stripe webhook to call
export { finalizeVendor };
