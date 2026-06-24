import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export const dynamic = "force-dynamic";

const PAID_STATUSES = "('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')";

// Platform fee the platform actually KEEPS. The fee is given back only on a FULL
// refund (refund_application_fee:true), detectable as refunded >= amount. A net
// refund withholds the fee (we keep the full amount), and a clean sale keeps it.
const NET_FEE = `CASE WHEN "refundedAmountCents" >= "amountCents" THEN 0 ELSE "platformFeeCents" END`;
const NET_FEE_P = `CASE WHEN p."refundedAmountCents" >= p."amountCents" THEN 0 ELSE p."platformFeeCents" END`;

/** Preset windows. `interval` is a trusted Postgres interval literal; `bucket`/`fmt` drive the chart. */
const PRESETS: Record<string, { short: string; label: string; interval: string | null; bucket: string; fmt: string }> = {
  "1h": { short: "1H", label: "Last hour", interval: "1 hour", bucket: "minute", fmt: "HH24:MI" },
  "1d": { short: "1D", label: "Last 24 hours", interval: "24 hours", bucket: "hour", fmt: "HH24:MI" },
  "1w": { short: "1W", label: "Last 7 days", interval: "7 days", bucket: "day", fmt: "MM-DD" },
  "1m": { short: "1M", label: "Last 30 days", interval: "30 days", bucket: "day", fmt: "MM-DD" },
  "1y": { short: "1Y", label: "Last 12 months", interval: "12 months", bucket: "month", fmt: "YYYY-MM" },
  all: { short: "All", label: "All time", interval: null, bucket: "month", fmt: "YYYY-MM" },
};
const PRESET_ORDER = ["1h", "1d", "1w", "1m", "1y", "all"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmt(cents: number): string {
  return "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCompact(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString();
}
const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);

export default async function AdminFinancialsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  // ── Resolve the selected time window ────────────────────────────────────
  const rawRange = searchParams?.range ?? "all";
  const from = searchParams?.from && DATE_RE.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams?.to && DATE_RE.test(searchParams.to) ? searchParams.to : undefined;
  const customActive = rawRange === "custom" && (!!from || !!to);

  let preset = PRESETS[rawRange] ? rawRange : "all";
  let bucket: string, labelFmt: string, rangeLabel: string;

  /** Build the time predicate for a given timestamp column. All inputs are whitelisted/validated. */
  function timeClause(col: string): string {
    if (customActive) {
      const parts: string[] = [];
      if (from) parts.push(`${col} >= '${from}'::date`);
      if (to) parts.push(`${col} < ('${to}'::date + interval '1 day')`);
      return parts.length ? " AND " + parts.join(" AND ") : "";
    }
    const p = PRESETS[preset] ?? PRESETS.all;
    return p.interval ? ` AND ${col} >= now() - interval '${p.interval}'` : "";
  }

  if (customActive) {
    const span = from && to ? (Date.parse(to) - Date.parse(from)) / 86_400_000 : 60;
    bucket = span <= 2 ? "hour" : span <= 62 ? "day" : "month";
    labelFmt = bucket === "hour" ? "MM-DD HH24:MI" : bucket === "day" ? "MM-DD" : "YYYY-MM";
    rangeLabel = `${from ?? "…"} → ${to ?? "…"}`;
  } else {
    if (rawRange === "custom") preset = "all"; // custom chosen but no valid dates → fall back
    const p = PRESETS[preset];
    bucket = p.bucket;
    labelFmt = p.fmt;
    rangeLabel = p.label;
  }
  const whereTime = timeClause(`"createdAt"`);
  const whereTimeP = timeClause(`p."createdAt"`);

  // ── Queries ─────────────────────────────────────────────────────────────
  const [totalsRows, trend, leaderboard, subs, subRevRows, disputeRows, connectIncomplete, timingRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ gross: bigint; refunded: bigint; fee_net: bigint; txns: bigint }>>(`
      SELECT
        COALESCE(SUM("amountCents"),0)::bigint AS gross,
        COALESCE(SUM("refundedAmountCents"),0)::bigint AS refunded,
        COALESCE(ROUND(SUM(${NET_FEE})),0)::bigint AS fee_net,
        COUNT(*)::bigint AS txns
      FROM payments
      WHERE status IN ${PAID_STATUSES}${whereTime}
    `),
    prisma.$queryRawUnsafe<Array<{ label: string; net_fee: bigint }>>(`
      SELECT to_char(date_trunc('${bucket}', "createdAt"), '${labelFmt}') AS label,
        COALESCE(ROUND(SUM(${NET_FEE})),0)::bigint AS net_fee
      FROM payments
      WHERE status IN ${PAID_STATUSES}${whereTime}
      GROUP BY date_trunc('${bucket}', "createdAt")
      ORDER BY date_trunc('${bucket}', "createdAt")
    `),
    prisma.$queryRawUnsafe<Array<{ id: string; name: string; slug: string; net_gmv: bigint; net_fee: bigint }>>(`
      SELECT o.id, o.name, o.slug,
        COALESCE(SUM(p."amountCents" - p."refundedAmountCents"),0)::bigint AS net_gmv,
        COALESCE(ROUND(SUM(${NET_FEE_P})),0)::bigint AS net_fee
      FROM payments p
      JOIN registrations r ON r.id = p."registrationId"
      JOIN events e ON e.id = r."eventId"
      JOIN organizations o ON o.id = e."organizationId"
      WHERE p.status IN ${PAID_STATUSES}${whereTimeP}
      GROUP BY o.id, o.name, o.slug
      ORDER BY net_fee DESC
      LIMIT 10
    `),
    prisma.organization.groupBy({
      by: ["subscriptionPlan", "subscriptionStatus"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    // Platform product revenue, split by kind (windowed by invoice/purchase time):
    // one-time single-event passes (planKey 'SINGLE_EVENT') vs recurring subscription
    // invoices (everything else).
    prisma.$queryRawUnsafe<Array<{ sub_rev: bigint; se_rev: bigint; se_count: bigint }>>(`
      SELECT
        COALESCE(SUM(CASE WHEN "planKey" IS DISTINCT FROM 'SINGLE_EVENT' THEN "amountPaidCents" ELSE 0 END),0)::bigint AS sub_rev,
        COALESCE(SUM(CASE WHEN "planKey" = 'SINGLE_EVENT' THEN "amountPaidCents" ELSE 0 END),0)::bigint AS se_rev,
        COALESCE(SUM(CASE WHEN "planKey" = 'SINGLE_EVENT' THEN 1 ELSE 0 END),0)::bigint AS se_count
      FROM billing_invoices WHERE TRUE${whereTime}
    `),
    // Disputes / chargebacks (windowed by dispute creation time).
    prisma.$queryRawUnsafe<Array<{ cnt: bigint; amt: bigint }>>(`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM("amountCents"),0)::bigint AS amt
      FROM disputes WHERE TRUE${whereTime}
    `),
    // Orgs that can't accept payments (current snapshot — silent lost revenue).
    prisma.organization.findMany({
      where: { deletedAt: null, OR: [{ stripeAccountId: null }, { stripeAccountChargesEnabled: false }] },
      select: { id: true, name: true, slug: true, stripeAccountId: true, stripeAccountStatus: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    // Revenue split by whether the event is upcoming or already past (windowed by txn time).
    prisma.$queryRawUnsafe<Array<{ upcoming: boolean; net_gmv: bigint; net_fee: bigint; events: number }>>(`
      SELECT (e."startAt" >= now()) AS upcoming,
        COALESCE(SUM(p."amountCents"-p."refundedAmountCents"),0)::bigint AS net_gmv,
        COALESCE(ROUND(SUM(${NET_FEE_P})),0)::bigint AS net_fee,
        COUNT(DISTINCT e.id)::int AS events
      FROM payments p
      JOIN registrations r ON r.id = p."registrationId"
      JOIN events e ON e.id = r."eventId"
      WHERE p.status IN ${PAID_STATUSES}${whereTimeP}
      GROUP BY (e."startAt" >= now())
    `),
  ]);

  const t = totalsRows[0] ?? { gross: 0n, refunded: 0n, fee_net: 0n, txns: 0n };
  const grossCents = num(t.gross);
  const refundedCents = num(t.refunded);
  const feeNetCents = num(t.fee_net);
  const netGmvCents = grossCents - refundedCents;
  const takeRate = netGmvCents > 0 ? (feeNetCents / netGmvCents) * 100 : 0;
  const subRevCents = num(subRevRows[0]?.sub_rev);
  const singleEventRevCents = num(subRevRows[0]?.se_rev);
  const singleEventCount = num(subRevRows[0]?.se_count);
  const totalPlatformRevCents = feeNetCents + subRevCents + singleEventRevCents;
  const disputeCount = num(disputeRows[0]?.cnt);
  const disputeAmtCents = num(disputeRows[0]?.amt);
  const upcoming = timingRows.find((r) => r.upcoming);
  const past = timingRows.find((r) => !r.upcoming);

  // MRR / subscription status are current snapshots — not affected by the window.
  let mrrCents = 0;
  const statusCounts: Record<string, number> = {};
  for (const row of subs) {
    const c = row._count._all;
    statusCounts[row.subscriptionStatus] = (statusCounts[row.subscriptionStatus] ?? 0) + c;
    const plan = PLANS[row.subscriptionPlan as keyof typeof PLANS];
    const active = row.subscriptionStatus === "ACTIVE" || row.subscriptionStatus === "TRIALING";
    if (plan && plan.cadence === "monthly" && active) mrrCents += c * plan.priceCents;
  }
  const arrCents = mrrCents * 12;

  const maxFee = Math.max(1, ...trend.map((m) => num(m.net_fee)));
  const labelStep = Math.max(1, Math.ceil(trend.length / 12)); // keep x-axis readable

  const presetCls = (active: boolean) =>
    `rounded-lg px-3 py-1 text-sm ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="opacity-80 hover:opacity-100">Overview</Link>
            <Link href="/admin/organizers" className="opacity-80 hover:opacity-100">Organizers</Link>
            <Link href="/admin/vendors" className="opacity-80 hover:opacity-100">Vendors</Link>
            <Link href="/admin/attendees" className="opacity-80 hover:opacity-100">Attendees</Link>
            <Link href="/admin/financials">Financials</Link>
            <Link href="/admin/audit" className="opacity-80 hover:opacity-100">Audit log</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Platform financials</h1>
        <p className="text-sm text-slate-500">
          Showing <strong className="text-slate-700">{rangeLabel}</strong> · transaction times in UTC
        </p>

        {/* Time range selector */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRESET_ORDER.map((key) => (
            <Link key={key} href={`/admin/financials?range=${key}`} className={presetCls(!customActive && preset === key)}>
              {PRESETS[key].short}
            </Link>
          ))}
          <form method="get" className="ml-2 flex items-center gap-2">
            <input type="hidden" name="range" value="custom" />
            <input type="date" name="from" defaultValue={from} className="input !py-1 text-sm" aria-label="From date" />
            <span className="text-slate-400">→</span>
            <input type="date" name="to" defaultValue={to} className="input !py-1 text-sm" aria-label="To date" />
            <button type="submit" className={presetCls(customActive)}>Apply</button>
          </form>
        </div>

        {/* Headline (windowed) — the three revenue streams that sum to total */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total platform revenue" value={fmt(totalPlatformRevCents)} hint={`Fees + passes + subscriptions · ${rangeLabel.toLowerCase()}`} accent />
          <Stat label="Platform fee revenue" value={fmt(feeNetCents)} hint="Ticket/vendor cut, net of refunds" />
          <Stat label="Single-event purchases" value={fmt(singleEventRevCents)} hint={`${singleEventCount.toLocaleString()} one-time pass${singleEventCount === 1 ? "" : "es"}`} />
          <Stat label="Subscription revenue" value={fmt(subRevCents)} hint="Recurring plan invoices" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Net GMV processed" value={fmt(netGmvCents)} hint="Sales volume, net of refunds" small />
          <Stat label="Take rate" value={`${takeRate.toFixed(2)}%`} hint="Fee revenue ÷ net GMV" small />
          <Stat label="MRR" value={fmt(mrrCents)} hint={`ARR ${fmtCompact(arrCents)} · current`} small />
          <Stat label="Paid transactions" value={num(t.txns).toLocaleString()} small />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Gross processed" value={fmt(grossCents)} small />
          <Stat label="Refunds" value={fmt(refundedCents)} small />
          <Stat label="Disputes" value={String(disputeCount)} hint={disputeCount ? `${fmt(disputeAmtCents)} disputed` : "none in window"} small />
          <Stat label="Payments-disabled orgs" value={String(connectIncomplete.length)} small hint="can't transact" />
        </div>

        {/* Trend (windowed + bucketed) */}
        <div className="mt-8 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Platform fee revenue — {rangeLabel.toLowerCase()}</h2>
          {trend.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No transactions in this window.</p>
          ) : (
            <div className="mt-5 flex h-40 items-end gap-1">
              {trend.map((m, i) => {
                const v = num(m.net_fee);
                const pct = Math.max(2, (v / maxFee) * 100);
                return (
                  <div key={`${m.label}-${i}`} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${fmt(v)}`}>
                    <div className="w-full rounded-t bg-brand-500" style={{ height: `${pct}%` }} />
                    <div className="h-3 text-[9px] text-slate-400">{i % labelStep === 0 ? m.label : ""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Org leaderboard (windowed) */}
          <div className="rounded-xl bg-white ring-1 ring-slate-200">
            <div className="border-b px-5 py-3"><h2 className="font-semibold">Top organizations by fee revenue</h2></div>
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-2">Organization</th><th className="px-5 py-2 text-right">Net GMV</th><th className="px-5 py-2 text-right">Fee revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-2"><Link href={`/admin/orgs/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.name}</Link></td>
                    <td className="px-5 py-2 text-right text-slate-600">{fmt(num(o.net_gmv))}</td>
                    <td className="px-5 py-2 text-right font-medium">{fmt(num(o.net_fee))}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-500">No paid transactions in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Subscription health (current) */}
          <div className="rounded-xl bg-white ring-1 ring-slate-200">
            <div className="border-b px-5 py-3"><h2 className="font-semibold">Subscription status <span className="text-xs font-normal text-slate-400">· current</span></h2></div>
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <tbody className="divide-y divide-slate-100">
                {["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE", "NONE"].map((s) => (
                  <tr key={s}>
                    <td className="px-5 py-2">
                      {s === "PAST_DUE" ? <span className="font-medium text-amber-700">{s} (revenue at risk)</span> : <span className="text-slate-600">{s}</span>}
                    </td>
                    <td className="px-5 py-2 text-right font-medium">{statusCounts[s] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming vs past event revenue (windowed by transaction time) */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <TimingCard
            title="Upcoming events"
            subtitle="Revenue for events not yet held"
            netGmv={fmt(num(upcoming?.net_gmv))}
            netFee={fmt(num(upcoming?.net_fee))}
            events={num(upcoming?.events)}
            accent
          />
          <TimingCard
            title="Past events"
            subtitle="Revenue for events already held"
            netGmv={fmt(num(past?.net_gmv))}
            netFee={fmt(num(past?.net_fee))}
            events={num(past?.events)}
          />
        </div>

        {/* Payments-disabled orgs (current snapshot — lost revenue) */}
        <div className="mt-6 rounded-xl bg-white ring-1 ring-slate-200">
          <div className="border-b px-5 py-3">
            <h2 className="font-semibold">
              Payments-disabled organizations <span className="text-xs font-normal text-slate-400">· current · lost revenue</span>
            </h2>
          </div>
          {connectIncomplete.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">All organizations can accept payments.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <tbody className="divide-y divide-slate-100">
                {connectIncomplete.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-2"><Link href={`/admin/orgs/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.name}</Link></td>
                    <td className="px-5 py-2 text-slate-500">{o.stripeAccountId ? "onboarding incomplete" : "no Stripe account"}</td>
                    <td className="px-5 py-2 text-right text-xs text-slate-400">{o.stripeAccountStatus ?? "not_started"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Platform fee figures are tracked from the deploy that added fee persistence forward; transactions
          recorded before that show $0 fee until backfilled from Stripe (run scripts/backfill-platform-fees.ts).
          Single-event purchases are one-time pass payments captured at checkout; purchases made before capture
          existed backfill via scripts/backfill-single-event-purchases.ts. Subscription revenue comes from recurring
          Stripe invoices. MRR/ARR, subscription status, and the payments-disabled list are current snapshots
          (not affected by the selected window).
        </p>
      </section>
    </main>
  );
}

function TimingCard({ title, subtitle, netGmv, netFee, events, accent }: { title: string; subtitle: string; netGmv: string; netFee: string; events: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ring-1 ${accent ? "bg-brand-50 ring-brand-200" : "bg-white ring-slate-200"}`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-slate-400">{events} event{events === 1 ? "" : "s"}</span>
      </div>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3 flex gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">Net GMV</div>
          <div className="mt-0.5 text-xl font-bold">{netGmv}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">Fee revenue</div>
          <div className="mt-0.5 text-xl font-bold text-brand-800">{netFee}</div>
        </div>
      </div>
    </div>
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
