import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Payment statuses that represent real, collected money. */
const PAID = Prisma.sql`('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')`;

export interface TimeWindow {
  from?: Date;
  to?: Date;
}

/** Optional `AND p."createdAt" …` fragment. Bounds are bound params (injection-safe). */
function timeFrag(window?: TimeWindow): Prisma.Sql {
  if (window?.from && window?.to) return Prisma.sql`AND p."createdAt" >= ${window.from} AND p."createdAt" < ${window.to}`;
  if (window?.from) return Prisma.sql`AND p."createdAt" >= ${window.from}`;
  if (window?.to) return Prisma.sql`AND p."createdAt" < ${window.to}`;
  return Prisma.empty;
}

export interface KindTotals {
  grossCents: number;
  netCents: number; // gross − refunded
  refundedCents: number;
  feeCents: number; // platform fee we took
  count: number; // tickets: units sold; vendors: paid booths
}
export interface RevenueSplit {
  ticket: KindTotals;
  vendor: KindTotals;
}

function emptyKind(): KindTotals {
  return { grossCents: 0, netCents: 0, refundedCents: 0, feeCents: 0, count: 0 };
}

/**
 * Ticket vs vendor revenue for one event OR one org (or all orgs when neither is
 * given). Splits on TicketType.isVendorTier. Net is after refunds; feeCents is
 * the platform's cut (so organizer payout ≈ net − fee, before Stripe's own fee).
 */
export async function revenueSplit(scope: { eventId?: string; organizationId?: string | null; window?: TimeWindow }): Promise<RevenueSplit> {
  const where = scope.eventId
    ? Prisma.sql`r."eventId" = ${scope.eventId}`
    : scope.organizationId
      ? Prisma.sql`e."organizationId" = ${scope.organizationId} AND e."deletedAt" IS NULL`
      : Prisma.sql`e."deletedAt" IS NULL`;

  const rows = await prisma.$queryRaw<Array<{ vendor: boolean; txns: number; qty: number; gross: bigint; refunded: bigint; fee: bigint }>>`
    SELECT tt."isVendorTier" AS vendor,
      COUNT(*)::int AS txns,
      COALESCE(SUM(r.quantity),0)::int AS qty,
      COALESCE(SUM(p."amountCents"),0)::bigint AS gross,
      COALESCE(SUM(p."refundedAmountCents"),0)::bigint AS refunded,
      -- Platform fee the platform actually KEEPS. We only give the fee back on a
      -- FULL refund (refund_application_fee:true), detectable as refunded >= amount.
      -- A net refund withholds the fee, so the full fee is retained — and a clean
      -- sale keeps the full fee too. (Net payout = gross − refunded − this fee,
      -- which is 0 for a fully-refunded ticket, never negative.)
      COALESCE(SUM(CASE WHEN p."refundedAmountCents" >= p."amountCents" THEN 0 ELSE p."platformFeeCents" END),0)::bigint AS fee
    FROM payments p
    JOIN registrations r ON r.id = p."registrationId"
    JOIN ticket_types tt ON tt.id = r."ticketTypeId"
    JOIN events e ON e.id = r."eventId"
    WHERE p.status IN ${PAID} AND ${where} ${timeFrag(scope.window)}
    GROUP BY tt."isVendorTier"
  `;

  const split: RevenueSplit = { ticket: emptyKind(), vendor: emptyKind() };
  for (const r of rows) {
    const k: KindTotals = {
      grossCents: Number(r.gross),
      refundedCents: Number(r.refunded),
      netCents: Number(r.gross) - Number(r.refunded),
      feeCents: Number(r.fee),
      count: r.vendor ? Number(r.txns) : Number(r.qty),
    };
    if (r.vendor) split.vendor = k;
    else split.ticket = k;
  }
  return split;
}

export interface EventRevenueRow {
  id: string;
  name: string;
  startAt: Date;
  ticketNetCents: number;
  vendorNetCents: number;
  ticketCount: number;
  vendorCount: number;
}

/** Per-event revenue rows for an org (or all orgs), ranked by total net. */
export async function perEventBreakdown(organizationId?: string | null, window?: TimeWindow): Promise<EventRevenueRow[]> {
  const orgFilter = organizationId ? Prisma.sql`AND e."organizationId" = ${organizationId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; startAt: Date; ticket_net: bigint; vendor_net: bigint; ticket_qty: number; vendor_count: number }>>`
    SELECT e.id, e.name, e."startAt",
      COALESCE(SUM(CASE WHEN NOT tt."isVendorTier" THEN p."amountCents"-p."refundedAmountCents" ELSE 0 END),0)::bigint AS ticket_net,
      COALESCE(SUM(CASE WHEN tt."isVendorTier" THEN p."amountCents"-p."refundedAmountCents" ELSE 0 END),0)::bigint AS vendor_net,
      COALESCE(SUM(CASE WHEN NOT tt."isVendorTier" THEN r.quantity ELSE 0 END),0)::int AS ticket_qty,
      COALESCE(SUM(CASE WHEN tt."isVendorTier" THEN 1 ELSE 0 END),0)::int AS vendor_count
    FROM events e
    JOIN registrations r ON r."eventId" = e.id
    JOIN payments p ON p."registrationId" = r.id
    JOIN ticket_types tt ON tt.id = r."ticketTypeId"
    WHERE p.status IN ${PAID} AND e."deletedAt" IS NULL ${orgFilter} ${timeFrag(window)}
    GROUP BY e.id, e.name, e."startAt"
    ORDER BY SUM(p."amountCents"-p."refundedAmountCents") DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startAt: r.startAt,
    ticketNetCents: Number(r.ticket_net),
    vendorNetCents: Number(r.vendor_net),
    ticketCount: Number(r.ticket_qty),
    vendorCount: Number(r.vendor_count),
  }));
}

export interface TicketTypeRevenueRow {
  id: string;
  name: string;
  isVendor: boolean;
  qty: number;
  netCents: number;
}

/** Per-ticket-type revenue for one event (used on the event page). */
export async function perTicketTypeBreakdown(eventId: string): Promise<TicketTypeRevenueRow[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; isvendor: boolean; qty: number; net: bigint }>>`
    SELECT tt.id, tt.name, tt."isVendorTier" AS isvendor,
      COALESCE(SUM(r.quantity),0)::int AS qty,
      COALESCE(SUM(p."amountCents"-p."refundedAmountCents"),0)::bigint AS net
    FROM payments p
    JOIN registrations r ON r.id = p."registrationId"
    JOIN ticket_types tt ON tt.id = r."ticketTypeId"
    WHERE p.status IN ${PAID} AND r."eventId" = ${eventId}
    GROUP BY tt.id, tt.name, tt."isVendorTier"
    ORDER BY net DESC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, isVendor: r.isvendor, qty: Number(r.qty), netCents: Number(r.net) }));
}

export interface TrendPoint {
  label: string;
  netCents: number;
}

/**
 * Net revenue bucketed over time for the trend chart. `bucket` (minute/hour/day/
 * month) and `labelFmt` are passed as bound params to date_trunc/to_char, so they
 * are not interpolated into the SQL text.
 */
const VALID_BUCKETS = new Set(["minute", "hour", "day", "month"]);
const VALID_FMTS = new Set(["HH24:MI", "MM-DD", "YYYY-MM", "MM-DD HH24:MI"]);

export async function revenueTrend(
  scope: { eventId?: string; organizationId?: string | null; window?: TimeWindow },
  bucket: string,
  labelFmt: string,
): Promise<TrendPoint[]> {
  // Inline as validated literals (NOT bound params): Postgres must see the same
  // date_trunc expression text in SELECT, GROUP BY and ORDER BY to group on it.
  // Prisma binds each ${} separately, which would make them three distinct params.
  const b = VALID_BUCKETS.has(bucket) ? bucket : "month";
  const f = VALID_FMTS.has(labelFmt) ? labelFmt : "YYYY-MM";
  const bk = Prisma.raw(`'${b}'`);
  const fmt = Prisma.raw(`'${f}'`);

  const where = scope.eventId
    ? Prisma.sql`r."eventId" = ${scope.eventId}`
    : scope.organizationId
      ? Prisma.sql`e."organizationId" = ${scope.organizationId} AND e."deletedAt" IS NULL`
      : Prisma.sql`e."deletedAt" IS NULL`;
  const rows = await prisma.$queryRaw<Array<{ label: string; net: bigint }>>`
    SELECT to_char(date_trunc(${bk}, p."createdAt"), ${fmt}) AS label,
      COALESCE(SUM(p."amountCents"-p."refundedAmountCents"),0)::bigint AS net
    FROM payments p
    JOIN registrations r ON r.id = p."registrationId"
    JOIN events e ON e.id = r."eventId"
    WHERE p.status IN ${PAID} AND ${where} ${timeFrag(scope.window)}
    GROUP BY date_trunc(${bk}, p."createdAt")
    ORDER BY date_trunc(${bk}, p."createdAt")
  `;
  return rows.map((r) => ({ label: r.label, netCents: Number(r.net) }));
}

/** Total promo discount given (sale value forgone) for an org/event, optionally windowed. */
export async function promoDiscountTotal(scope: { eventId?: string; organizationId?: string | null; window?: TimeWindow }): Promise<number> {
  const where = scope.eventId
    ? Prisma.sql`r."eventId" = ${scope.eventId}`
    : scope.organizationId
      ? Prisma.sql`e."organizationId" = ${scope.organizationId} AND e."deletedAt" IS NULL`
      : Prisma.sql`e."deletedAt" IS NULL`;
  const rows = await prisma.$queryRaw<Array<{ disc: bigint }>>`
    SELECT COALESCE(SUM(r."discountCents"),0)::bigint AS disc
    FROM payments p
    JOIN registrations r ON r.id = p."registrationId"
    JOIN events e ON e.id = r."eventId"
    WHERE p.status IN ${PAID} AND ${where} ${timeFrag(scope.window)}
  `;
  return Number(rows[0]?.disc ?? 0);
}
