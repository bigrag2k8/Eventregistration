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
    include: { event: true, ticketType: true },
  });
  if (!reg || reg.status !== "PENDING") {
    return NextResponse.json({ error: "Registration not pending" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"], // Apple/Google Pay flow auto-enabled when wallets supported
    line_items: [
      {
        quantity: reg.quantity,
        price_data: {
          currency: reg.currency.toLowerCase(),
          unit_amount: Math.round((reg.totalCents - reg.feeCents - reg.taxCents) / reg.quantity),
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
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${reg.event.slug}/success?reg=${reg.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${reg.event.slug}/register`,
    metadata: { registrationId: reg.id, eventId: reg.eventId },
    payment_intent_data: { metadata: { registrationId: reg.id } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  await prisma.registration.update({
    where: { id: reg.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
