/**
 * One-time backfill of single-event pass purchases into billing_invoices.
 *
 * One-time Checkout (mode: payment) never creates a Stripe invoice, so the $19
 * single-event purchases made before live capture existed were never recorded
 * as platform revenue. This walks Stripe Checkout Sessions, finds the paid
 * single-event ones, and upserts a billing_invoices row (planKey 'SINGLE_EVENT')
 * keyed on the PaymentIntent id — the SAME key the live-capture path uses
 * (src/server/billing.ts recordSingleEventPurchase), so re-running is safe and
 * never double-counts.
 *
 * Needs STRIPE_SECRET_KEY (matching the account that took the payments) and
 * DATABASE_URL for the target database in the environment.
 *
 * Run:  npx tsx scripts/backfill-single-event-purchases.ts --dry-run   (preview)
 *       npx tsx scripts/backfill-single-event-purchases.ts             (write)
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY not set.");
    process.exit(1);
  }
  const stripe = new Stripe(key);

  let startingAfter: string | undefined;
  let scanned = 0,
    matched = 0,
    written = 0,
    skipped = 0;

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const s of page.data) {
      scanned++;
      const isSingle =
        s.mode === "payment" &&
        (s.metadata?.planKey === "SINGLE_EVENT" || s.metadata?.kind === "single_event_credit");
      if (!isSingle) continue;
      if (s.payment_status !== "paid") {
        skipped++;
        continue;
      }
      const amount = s.amount_total ?? 0;
      if (amount <= 0) {
        skipped++;
        continue;
      }
      matched++;

      const piId = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent as any)?.id ?? null;
      const keyId = piId ?? s.id;
      const createdAt = new Date((s.created ?? Math.floor(Date.now() / 1000)) * 1000);

      // The org may have been deleted since the purchase; only link a FK that
      // still exists (billing_invoices.organizationId is nullable / SetNull).
      const rawOrgId = s.metadata?.organizationId ?? null;
      const orgId =
        rawOrgId && (await prisma.organization.findUnique({ where: { id: rawOrgId }, select: { id: true } }))
          ? rawOrgId
          : null;

      if (DRY) {
        console.log(`  (dry) ${keyId} org=${orgId ?? "—"} $${(amount / 100).toFixed(2)} ${createdAt.toISOString()}`);
        continue;
      }

      await prisma.billingInvoice.upsert({
        where: { stripeInvoiceId: keyId },
        create: {
          stripeInvoiceId: keyId,
          organizationId: orgId,
          stripeCustomerId: s.customer ? String(s.customer) : null,
          planKey: "SINGLE_EVENT",
          amountPaidCents: amount,
          currency: (s.currency ?? "usd").toUpperCase(),
          status: "paid",
          createdAt,
        },
        update: { amountPaidCents: amount, status: "paid", organizationId: orgId ?? undefined },
      });
      written++;
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  console.log(`Done. scanned=${scanned} matched=${matched} written=${written} skipped=${skipped} dry=${DRY}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
