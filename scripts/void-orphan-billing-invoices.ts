/**
 * One-off reconciliation: VOID orphaned subscription billing_invoices rows.
 *
 * A stale `billing_invoices` row (e.g. a $24.99 invoice from an old test/sandbox
 * subscription) has no counterpart in the live Stripe account, yet the financials
 * dashboard sums it into "Subscription revenue" / "Total platform revenue".
 *
 * This walks every NON-single-event row that is still active (voidedAt IS NULL) and
 * tries to retrieve its invoice from the live Stripe account. A row is voided ONLY
 * when Stripe confirms there is no matching live invoice (resource_missing) or the
 * retrieved invoice is not livemode. We never DELETE — voided rows are kept for
 * audit (status='void', voidedAt set) and excluded from revenue by the dashboard
 * query (src/app/admin/financials/page.tsx: `WHERE "voidedAt" IS NULL`).
 *
 * SINGLE_EVENT rows are skipped entirely: their key is a PaymentIntent id, not an
 * invoice id, so an invoice retrieve would 404 and falsely void a real pass sale.
 *
 * Guarded: prints a preview by default. Pass --apply to actually write the voids.
 * Rows are voided one at a time only after Stripe has been consulted for each.
 *
 * Needs STRIPE_SECRET_KEY (the LIVE key for acct_1TgM4oGuuTGvI6kM) and DATABASE_URL
 * for the target database in the environment.
 *
 * Run:  npx tsx scripts/void-orphan-billing-invoices.ts            (preview)
 *       npx tsx scripts/void-orphan-billing-invoices.ts --apply    (write)
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY not set.");
    process.exit(1);
  }
  const stripe = new Stripe(key);

  // Subscription-revenue rows only (NOT single-event passes), still counted.
  // Mirror the dashboard's `planKey IS DISTINCT FROM 'SINGLE_EVENT'`: a NULL
  // planKey is "not single-event" and MUST be included (a plain `not` filter
  // drops NULLs via SQL three-valued logic — that's exactly the orphan we want).
  const rows = await prisma.billingInvoice.findMany({
    where: {
      voidedAt: null,
      OR: [{ planKey: null }, { NOT: { planKey: "SINGLE_EVENT" } }],
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Reconciling ${rows.length} non-single-event billing_invoices row(s) against the live Stripe account…\n`);

  let voided = 0;
  let kept = 0;
  let inconclusive = 0;

  for (const row of rows) {
    const id = row.stripeInvoiceId;
    const amount = `$${(row.amountPaidCents / 100).toFixed(2)}`;
    let verdict: "keep" | "void" | "skip" = "skip";
    let why = "";

    if (!id.startsWith("in_")) {
      // Not a Stripe invoice id — can't safely reconcile as an invoice. Leave it.
      verdict = "skip";
      why = "id is not an invoice id (in_…)";
    } else {
      try {
        const inv = await stripe.invoices.retrieve(id);
        if (inv.livemode === true) {
          verdict = "keep";
          why = `live invoice exists (status=${inv.status})`;
        } else {
          verdict = "void";
          why = "invoice is not livemode";
        }
      } catch (e: any) {
        if (e?.code === "resource_missing" || e?.statusCode === 404) {
          verdict = "void";
          why = "no such invoice in the live account";
        } else {
          // Transient/auth error — do NOT void on uncertainty.
          verdict = "skip";
          why = `stripe error: ${e?.message ?? e?.code ?? "unknown"}`;
        }
      }
    }

    const tag = verdict === "void" ? "VOID " : verdict === "keep" ? "keep " : "skip ";
    console.log(`  [${tag}] ${id}  ${amount}  org=${row.organizationId ?? "—"}  planKey=${row.planKey ?? "—"}  — ${why}`);

    if (verdict === "void") {
      if (APPLY) {
        const now = new Date();
        await prisma.billingInvoice.update({
          where: { id: row.id },
          data: { voidedAt: now, status: "void" },
        });
        await prisma.auditLog.create({
          data: {
            organizationId: row.organizationId ?? null,
            action: "billing.invoice_voided",
            targetType: "BillingInvoice",
            targetId: row.id,
            metadata: {
              stripeInvoiceId: id,
              amountPaidCents: row.amountPaidCents,
              reason: why,
              script: "void-orphan-billing-invoices",
            } as any,
          },
        });
      }
      voided++;
    } else if (verdict === "keep") {
      kept++;
    } else {
      inconclusive++;
    }
  }

  console.log(
    `\nDone. voided=${voided} kept=${kept} skipped/inconclusive=${inconclusive} apply=${APPLY}` +
      (APPLY ? "" : "  (preview only — re-run with --apply to write)"),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
