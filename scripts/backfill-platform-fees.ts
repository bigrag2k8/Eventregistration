/**
 * One-time backfill of Payment.platformFeeCents for rows recorded before fee
 * persistence existed (they default to 0, so "all time" undercounts earnings).
 *
 * Modes:
 *   (default)    Authoritative — read each charge's application_fee_amount from Stripe.
 *   --estimate   Recompute from the registration's sale value × PLATFORM_FEE_PERCENT.
 *                Use when Stripe is unreachable or for local validation. Marked as
 *                an estimate because the historical fee rate may have differed.
 *   --dry-run    Show what would change without writing.
 *   --force      Re-process rows that already have a non-zero fee.
 *
 * Run:  npx tsx scripts/backfill-platform-fees.ts            (Stripe)
 *       npx tsx scripts/backfill-platform-fees.ts --estimate
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { PLATFORM_FEE_PERCENT } from "@/lib/connect";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const ESTIMATE = args.includes("--estimate");
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

async function feeFromStripe(stripe: Stripe, piId: string): Promise<number | null> {
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge;
  if (charge && typeof charge === "object" && typeof (charge as any).application_fee_amount === "number") {
    return (charge as any).application_fee_amount as number;
  }
  return null;
}

async function main() {
  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      ...(FORCE ? {} : { platformFeeCents: 0 }),
    },
    include: { registration: { select: { subtotalCents: true, discountCents: true } } },
  });
  console.log(`Candidates: ${payments.length}  (estimate=${ESTIMATE} dry=${DRY} force=${FORCE})`);

  let stripe: Stripe | null = null;
  if (!ESTIMATE) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.error("STRIPE_SECRET_KEY not set — pass --estimate to recompute from sale value instead.");
      process.exit(1);
    }
    stripe = new Stripe(key);
  }

  let updated = 0, skipped = 0, failed = 0;
  for (const p of payments) {
    let fee: number | null = null;
    if (ESTIMATE) {
      const base = Math.max(0, (p.registration?.subtotalCents ?? 0) - (p.registration?.discountCents ?? 0));
      fee = Math.round(base * (PLATFORM_FEE_PERCENT / 100));
    } else {
      if (!p.stripePaymentIntentId) { skipped++; continue; }
      try {
        fee = await feeFromStripe(stripe!, p.stripePaymentIntentId);
      } catch (e: any) {
        console.error(`  ! ${p.id} Stripe lookup failed: ${e?.message}`);
        failed++;
        continue;
      }
      if (fee == null) { skipped++; continue; }
    }
    if (fee == null) { skipped++; continue; }
    if (DRY) { console.log(`  (dry) ${p.id} -> ${fee}`); updated++; continue; }
    await prisma.payment.update({ where: { id: p.id }, data: { platformFeeCents: fee } });
    updated++;
  }
  console.log(`Done. updated=${updated} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
