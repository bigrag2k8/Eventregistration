import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { computeTotals, computeCartTotals } from "@/server/pricing";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  eventId: z.string(),
  ticketTypeId: z.string(),
  quantity: z.number().int().min(1).max(20),
  // Multi-pass conference cart: when present, the quote is the combined total.
  items: z
    .array(z.object({ ticketTypeId: z.string(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(20)
    .optional(),
  promoCode: z.string().optional(),
});

/**
 * Price quote for the registration form. Runs the SAME computeTotals used when
 * the registration is created, so the on-screen summary (incl. promo discount)
 * always matches what Stripe will charge — the client never does money math.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`quote:${ip}`, 60, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  const input = parsed.data;

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: { ticketTypes: true, promoCodes: true, organization: true },
  });
  if (!event || event.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Event not available" }, { status: 404 });
  }

  const totals = input.items?.length
    ? await computeCartTotals({ event, items: input.items, promoCode: input.promoCode })
    : await computeTotals({
        event,
        ticketTypeId: input.ticketTypeId,
        quantity: input.quantity,
        promoCode: input.promoCode,
      });
  if ("error" in totals) {
    return NextResponse.json({ error: totals.error }, { status: 400 });
  }

  return NextResponse.json({
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    fee: totals.fee,
    total: totals.total,
    currency: totals.currency,
    lines: "lines" in totals ? totals.lines : undefined,
  });
}
