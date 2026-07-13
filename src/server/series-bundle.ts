import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { issueTickets, releaseSeats } from "@/server/tickets";
import { sendBundleConfirmationEmail } from "@/lib/email";

/**
 * Webhook-side finalization of a full-series bundle purchase: flips the
 * purchase and every linked PENDING registration to CONFIRMED, writes one
 * Payment row PER registration carrying that session's share of the money
 * (and its share of the platform fee), then issues tickets and sends a single
 * bundle confirmation email.
 *
 * Idempotent: only the delivery that flips the purchase PENDING→CONFIRMED does
 * any work — Stripe redeliveries no-op.
 */
export async function finalizeBundlePurchase(
  bundleId: string,
  info: { paymentIntentId: string | null; amountCents: number | null; currency: string | null; platformFeeCents: number },
): Promise<void> {
  const confirmedRegIds = await prisma.$transaction(async (tx) => {
    const purchase = await tx.seriesBundlePurchase.findUnique({
      where: { id: bundleId },
      include: { registrations: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } } },
    });
    if (!purchase || purchase.status !== "PENDING") return [] as string[];

    await tx.seriesBundlePurchase.update({
      where: { id: bundleId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        stripePaymentIntentId: info.paymentIntentId,
      },
    });

    // Split the platform fee across the sessions the same way the price was
    // split — floor share everywhere, remainder on the first — so summing the
    // Payment rows reproduces the exact charged fee.
    const regs = purchase.registrations;
    const n = regs.length;
    const feeBase = n > 0 ? Math.floor(info.platformFeeCents / n) : 0;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = regs[i];
      const feeShare = i === 0 ? info.platformFeeCents - feeBase * (n - 1) : feeBase;
      await tx.registration.update({
        where: { id: r.id },
        data: { status: "CONFIRMED", confirmedAt: new Date(), stripePaymentIntentId: info.paymentIntentId },
      });
      await tx.payment.create({
        data: {
          registrationId: r.id,
          amountCents: r.totalCents,
          platformFeeCents: feeShare,
          currency: (info.currency ?? r.currency).toUpperCase(),
          status: "SUCCEEDED",
          stripePaymentIntentId: info.paymentIntentId,
        },
      });
      ids.push(r.id);
    }
    return ids;
  });

  if (confirmedRegIds.length === 0) return;

  for (const regId of confirmedRegIds) {
    try {
      await issueTickets(regId);
    } catch (e: any) {
      console.error(`[bundle] issueTickets failed for reg ${regId}:`, e?.message);
    }
  }
  try {
    await sendBundleConfirmationEmail(bundleId);
  } catch (e: any) {
    console.error(`[bundle] confirmation email failed for ${bundleId}:`, e?.message);
  }
}

/**
 * charge.refunded reconciliation for bundle charges (N Payment rows sharing
 * one PaymentIntent). Our refund initiators always attach
 * metadata.registrationId to bundle-share refunds, so each refund maps to
 * exactly one Payment row. Recomputes each affected payment's cumulative
 * refunded amount from the refund list (idempotent under redelivery).
 */
export async function reconcileBundleRefunds(charge: any): Promise<void> {
  // The embedded refund list is paginated; fetch the full list if truncated.
  let refunds: any[] = charge.refunds?.data ?? [];
  if (charge.refunds?.has_more) {
    try {
      const all = await stripe.refunds.list({ charge: charge.id, limit: 100 });
      refunds = all.data;
    } catch (e: any) {
      console.error("[bundle] failed to list refunds:", e?.message);
    }
  }

  // Group refund amounts by the registration they were issued for.
  const byReg = new Map<string, { total: number; lastRefundId: string }>();
  for (const r of refunds) {
    const regId = r.metadata?.registrationId;
    if (!regId) continue;
    const cur = byReg.get(regId) ?? { total: 0, lastRefundId: r.id };
    cur.total += r.amount ?? 0;
    cur.lastRefundId = r.id;
    byReg.set(regId, cur);
  }

  for (const [regId, info] of byReg) {
    const payment = await prisma.payment.findFirst({ where: { registrationId: regId } });
    if (!payment) continue;
    const fee = payment.platformFeeCents ?? 0;
    const fullyRefunded = info.total >= payment.amountCents - fee;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmountCents: info.total,
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        stripeRefundId: info.lastRefundId,
      },
    });
    if (fullyRefunded) {
      const reg = await prisma.registration.findUnique({
        where: { id: regId },
        select: { ticketTypeId: true, quantity: true, promoCodeId: true },
      });
      const flipped = await prisma.registration.updateMany({
        where: { id: regId, status: { not: "REFUNDED" } },
        data: { status: "REFUNDED" },
      });
      await prisma.ticket.updateMany({
        where: { registrationId: regId },
        data: { isValid: false, invalidatedAt: new Date(), invalidReason: "refund" },
      });
      if (flipped.count === 1 && reg) {
        await releaseSeats(prisma, reg.ticketTypeId, reg.quantity);
      }
    }
  }
}
