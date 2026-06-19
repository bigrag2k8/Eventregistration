import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage, orgScope } from "@/lib/auth";
import { money } from "@/lib/format";
import { PLANS, effectivePlan } from "@/lib/plans";
import { resolveRange, RANGE_PRESETS, RANGE_ORDER } from "@/lib/finance-range";
import { revenueSplit, perEventBreakdown, revenueTrend, promoDiscountTotal } from "@/server/finance";

export const dynamic = "force-dynamic";

export default async function OrgFinancialsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  const orgId = session.orgId ?? undefined;
  const range = resolveRange(searchParams, Date.now());
  const window = { from: range.from, to: range.to };

  const createdAtFilter: { gte?: Date; lt?: Date } = {};
  if (range.from) createdAtFilter.gte = range.from;
  if (range.to) createdAtFilter.lt = range.to;

  const [split, byEvent, trend, promoDiscount, org, taxAgg] = await Promise.all([
    revenueSplit({ organizationId: orgId, window }),
    perEventBreakdown(orgId, window),
    revenueTrend({ organizationId: orgId, window }, range.bucket, range.labelFmt),
    promoDiscountTotal({ organizationId: orgId, window }),
    orgId ? prisma.organization.findUnique({ where: { id: orgId } }) : Promise.resolve(null),
    prisma.registration.aggregate({
      where: {
        status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] },
        event: orgScope(session),
        ...(range.from || range.to ? { createdAt: createdAtFilter } : {}),
      },
      _sum: { taxCents: true },
    }),
  ]);

  const grossTotal = split.ticket.grossCents + split.vendor.grossCents;
  const totalNet = split.ticket.netCents + split.vendor.netCents;
  const totalFees = split.ticket.feeCents + split.vendor.feeCents;
  const totalRefunds = split.ticket.refundedCents + split.vendor.refundedCents;
  const netPayout = split.ticket.payoutCents + split.vendor.payoutCents;
  const refundRate = grossTotal > 0 ? (totalRefunds / grossTotal) * 100 : 0;
  const taxCollected = taxAgg._sum.taxCents ?? 0;

  const plan = org ? effectivePlan(org) : null;
  const catalog = org ? (PLANS[org.subscriptionPlan as keyof typeof PLANS] ?? PLANS.FREE) : null;
  const payoutsEnabled = !!org?.stripeAccountPayoutsEnabled;

  const maxTrend = Math.max(1, ...trend.map((t) => t.netCents));
  const labelStep = Math.max(1, Math.ceil(trend.length / 12));
  const qs = new URLSearchParams();
  if (searchParams.range) qs.set("range", searchParams.range);
  if (searchParams.from) qs.set("from", searchParams.from);
  if (searchParams.to) qs.set("to", searchParams.to);
  const exportHref = `/api/financials/export.csv${qs.toString() ? `?${qs}` : ""}`;
  const presetCls = (active: boolean) =>
    `rounded-lg px-3 py-1 text-sm ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Financials</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
            <Link href="/dashboard/billing" className="text-sm text-slate-600 hover:text-slate-900">Billing</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Financials</h1>
            <p className="text-sm text-slate-500">
              {org ? org.name : "All organizations"} · <strong className="text-slate-700">{range.label}</strong> · UTC
            </p>
          </div>
          <a href={exportHref} className="btn-secondary">Export CSV</a>
        </div>

        {/* Time range selector */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_ORDER.map((key) => (
            <Link key={key} href={`/dashboard/financials?range=${key}`} className={presetCls(!range.customActive && range.preset === key)}>
              {RANGE_PRESETS[key].short}
            </Link>
          ))}
          <form method="get" className="ml-2 flex items-center gap-2">
            <input type="hidden" name="range" value="custom" />
            <input type="date" name="from" defaultValue={range.fromStr} className="input !py-1 text-sm" aria-label="From date" />
            <span className="text-slate-400">→</span>
            <input type="date" name="to" defaultValue={range.toStr} className="input !py-1 text-sm" aria-label="To date" />
            <button type="submit" className={presetCls(range.customActive)}>Apply</button>
          </form>
        </div>

        {/* Revenue summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total revenue" value={money(totalNet)} hint="Tickets + vendors, net of refunds" accent />
          <Stat label="Ticket revenue" value={money(split.ticket.netCents)} hint={`${split.ticket.count} ticket${split.ticket.count === 1 ? "" : "s"} sold`} />
          <Stat label="Vendor revenue" value={money(split.vendor.netCents)} hint={`${split.vendor.count} booth${split.vendor.count === 1 ? "" : "s"}`} />
          <Stat label="Net payout" value={money(netPayout)} hint="After platform fee, before Stripe fee" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Platform fees" value={money(totalFees)} small hint="Paid to the platform" />
          <Stat label="Refunds issued" value={money(totalRefunds)} small hint={`${refundRate.toFixed(1)}% of gross`} />
          <Stat label="Promo discounts" value={money(promoDiscount)} small hint="Given to buyers" />
          <Stat label="Tax collected" value={money(taxCollected)} small hint="To remit" />
        </div>

        {/* Trend */}
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Revenue — {range.label.toLowerCase()}</h2>
          {trend.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No revenue in this window.</p>
          ) : (
            <div className="mt-5 flex h-36 items-end gap-1">
              {trend.map((m, i) => {
                const pct = Math.max(2, (m.netCents / maxTrend) * 100);
                return (
                  <div key={`${m.label}-${i}`} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${money(m.netCents)}`}>
                    <div className="w-full rounded-t bg-brand-500" style={{ height: `${pct}%` }} />
                    <div className="h-3 text-[9px] text-slate-400">{i % labelStep === 0 ? m.label : ""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Plan / tier + payout status */}
        {org && plan && catalog && (
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Your plan</div>
                <h2 className="mt-1 text-xl font-bold">{plan.name}</h2>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>Cost: <strong>{catalog.price}</strong></span>
                  <span>Status: <strong>{org.subscriptionStatus}</strong></span>
                  {org.subscriptionCurrentPeriodEnd && (
                    <span>{org.subscriptionCancelAtPeriodEnd ? "Cancels" : "Renews"}: <strong>{org.subscriptionCurrentPeriodEnd.toLocaleDateString()}</strong></span>
                  )}
                  {org.singleEventCredits > 0 && <span>Credits: <strong>{org.singleEventCredits}</strong></span>}
                </div>
                <div className="mt-3 text-sm">
                  Payouts:{" "}
                  {payoutsEnabled ? (
                    <span className="font-medium text-emerald-700">enabled</span>
                  ) : (
                    <>
                      <span className="font-medium text-amber-700">not set up ({org.stripeAccountStatus ?? "not_started"})</span>
                      {" — "}
                      <Link href="/dashboard" className="text-brand-700 hover:underline">finish setup on your dashboard</Link>
                    </>
                  )}
                </div>
              </div>
              <Link href="/dashboard/billing" className="btn-secondary">Manage plan</Link>
            </div>
          </section>
        )}

        {/* Per-event breakdown */}
        <section className="rounded-xl bg-white ring-1 ring-slate-200">
          <div className="border-b px-5 py-3"><h2 className="font-semibold">Revenue by event</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2">Event</th>
                  <th className="px-5 py-2 text-right">Tickets</th>
                  <th className="px-5 py-2 text-right">Ticket rev.</th>
                  <th className="px-5 py-2 text-right">Vendors</th>
                  <th className="px-5 py-2 text-right">Vendor rev.</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byEvent.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2">
                      <Link href={`/dashboard/events/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.name}</Link>
                      <div className="text-xs text-slate-400">{e.startAt.toLocaleDateString()}</div>
                    </td>
                    <td className="px-5 py-2 text-right text-slate-600">{e.ticketCount}</td>
                    <td className="px-5 py-2 text-right">{money(e.ticketNetCents)}</td>
                    <td className="px-5 py-2 text-right text-slate-600">{e.vendorCount}</td>
                    <td className="px-5 py-2 text-right">{money(e.vendorNetCents)}</td>
                    <td className="px-5 py-2 text-right font-medium">{money(e.ticketNetCents + e.vendorNetCents)}</td>
                  </tr>
                ))}
                {byEvent.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No paid revenue in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-slate-400">
          Revenue counts paid orders (free registrations show no revenue). Net payout is after the platform fee
          but before Stripe&rsquo;s own processing fee, which Stripe deducts at payout. MRR/plan details are current.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, hint, accent, small }: { label: string; value: string; hint?: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${accent ? "bg-brand-50 ring-brand-200" : "bg-white ring-slate-200"}`}>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-bold ${small ? "text-xl" : "text-2xl"} ${accent ? "text-brand-800" : "text-slate-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
