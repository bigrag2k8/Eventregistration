/**
 * Clean up phantom subscription-revenue rows in billing_invoices.
 *
 * Context: /admin/financials sums billing_invoices where planKey is NOT
 * 'SINGLE_EVENT' as "subscription revenue". A reconciliation against the LIVE
 * Stripe account (2026-06-27) found the dashboard showed $24.99 subscription
 * revenue while the live Stripe invoices list is EMPTY — i.e. a stale
 * BillingInvoice row left over from an old test/sandbox subscription with no
 * matching live Stripe invoice. It inflates "Total platform revenue".
 *
 * This script lists subscription-plan billing_invoices. It NEVER touches
 * SINGLE_EVENT passes. It only deletes rows you explicitly name via --id, and
 * only when --apply is passed.
 *
 * Uses RAW SQL (not the Prisma model layer) so it is immune to client/schema
 * drift — it selects only columns that exist in prod. Needs DATABASE_URL.
 *
 * Run:
 *   npx tsx scripts/cleanup-phantom-subscription-invoices.ts                       (list, dry-run)
 *   npx tsx scripts/cleanup-phantom-subscription-invoices.ts --id=cuid1,cuid2 --apply   (delete named rows)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const idArg = args.find((a) => a.startsWith("--id="));
const targetIds = idArg
  ? idArg.slice("--id=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Row = {
  id: string;
  planKey: string | null;
  amountPaidCents: number;
  stripeInvoiceId: string;
  organizationId: string | null;
  createdAt: Date;
};

async function main() {
  const all = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "id","planKey","amountPaidCents","stripeInvoiceId","organizationId","createdAt"
       FROM billing_invoices ORDER BY "createdAt" ASC`,
  );
  const subs = all.filter((r) => r.planKey !== "SINGLE_EVENT");
  const subTotal = subs.reduce((n, r) => n + Number(r.amountPaidCents), 0);

  console.log(
    `\nbilling_invoices: ${all.length} total · ${subs.length} subscription-plan row(s) summing ${fmt(subTotal)} (this is the dashboard's "subscription revenue")\n`,
  );
  for (const r of subs) {
    console.log(
      `  ${r.id}  ${fmt(Number(r.amountPaidCents))}  plan=${r.planKey ?? "null"}  org=${r.organizationId ?? "—"}  stripe=${r.stripeInvoiceId}  created=${new Date(r.createdAt).toISOString().slice(0, 10)}`,
    );
  }

  if (targetIds.length === 0) {
    console.log(`\nNothing deleted (no --id given). To remove orphaned row(s), re-run with --id=<id,...> --apply.\n`);
    return;
  }

  const toDelete = subs.filter((r) => targetIds.includes(r.id));
  const missing = targetIds.filter((id) => !all.some((r) => r.id === id));
  const protectedHit = all.filter((r) => targetIds.includes(r.id) && r.planKey === "SINGLE_EVENT");
  if (missing.length) {
    console.error(`Refusing: id(s) not found: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (protectedHit.length) {
    console.error(`Refusing: id(s) are SINGLE_EVENT passes, not subscription rows: ${protectedHit.map((r) => r.id).join(", ")}`);
    process.exit(1);
  }

  const delTotal = toDelete.reduce((n, r) => n + Number(r.amountPaidCents), 0);
  console.log(`\nTargeted for deletion: ${toDelete.length} row(s) summing ${fmt(delTotal)}.`);
  if (!APPLY) {
    console.log("DRY RUN — re-run with --apply to delete.\n");
    return;
  }

  let count = 0;
  for (const r of toDelete) {
    count += await prisma.$executeRaw`DELETE FROM billing_invoices WHERE id = ${r.id}`;
  }
  const afterRows = await prisma.$queryRawUnsafe<Array<{ planKey: string | null; amountPaidCents: number }>>(
    `SELECT "planKey","amountPaidCents" FROM billing_invoices`,
  );
  const after = afterRows.filter((r) => r.planKey !== "SINGLE_EVENT").reduce((n, r) => n + Number(r.amountPaidCents), 0);
  console.log(`\nDeleted ${count} row(s). Subscription revenue now ${fmt(after)} (was ${fmt(subTotal)}).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
