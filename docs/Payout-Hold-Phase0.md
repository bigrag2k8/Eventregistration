# Phase 0: Minimal Event-End Payout Hold

**Status:** Proposal (lean, ship-next) · **Date:** 2026-06-27
**Relationship to the full design:** This is the smallest useful slice of [`Payout-Risk-Design.md`](./Payout-Risk-Design.md). Ship this now; grow into the full tiered engine later, only when organizer volume demands it.

---

## Goal (one sentence)
**Hold a new organizer's ticket money in Stripe until their event has actually happened — then release it.** Nothing more.

## Explicitly NOT in Phase 0
- No 5-tier scoring engine, no automated trust score.
- No per-event sales caps.
- No rolling reserves, no partial early payouts.
- No per-event risk override.

Trust is a **single boolean flipped by a human** in Phase 0. That's enough to neutralize the "sell big, cancel, vanish" scenario at your current scale.

---

## How it works
- A **new** organizer's Stripe account is set to **manual payouts** — ticket money accumulates in *their Stripe balance* but does **not** reach their bank.
- A worker job releases that money **after the event ends** (`event.endAt + HOLD_DAYS`).
- If the event is **cancelled** before then, the money is still sitting in Stripe, so the existing refund flow can actually pay attendees back.
- Once an organizer has proven themselves, a **SUPERADMIN flips one switch** and they move to daily payouts (your current fast behavior).

---

## Schema (2 fields — non-destructive migration)
Use the `migrate dev → commit → migrate deploy` path (per SEC-04), not `db push`.

```prisma
model Organization {
  // ...existing stripeAccount* fields...
  /// When true, Stripe pays this org daily (current behavior). When false (default),
  /// payouts are manual and released per-event by the worker after the event ends.
  fastPayoutsEnabled Boolean @default(false)
}

model Event {
  // ...existing fields...
  /// Set by the worker once this event's held funds have been paid out. Null = still held.
  payoutReleasedAt DateTime?
}
```

---

## Three wiring points

### 1. Onboarding — schedule by the flag
In [`src/app/api/billing/connect/onboard/route.ts`](../src/app/api/billing/connect/onboard/route.ts), replace the hardcoded `interval: "daily"`:
```
settings: { payouts: { schedule: { interval: org.fastPayoutsEnabled ? "daily" : "manual" } } }
```
New orgs (`fastPayoutsEnabled = false`) start held.

### 2. Worker — release after the event
Add one job to [`src/server/worker.ts`](../src/server/worker.ts) `tick()` (same independent try/catch + Sentry pattern as the existing jobs):
```
const HOLD_DAYS = 3;

async function releaseEventPayouts() {
  const cutoff = new Date(Date.now() - HOLD_DAYS * ONE_DAY);
  const events = await prisma.event.findMany({
    where: {
      payoutReleasedAt: null,
      deletedAt: null,
      status: { not: "CANCELLED" },
      endAt: { lt: cutoff },
      organization: { fastPayoutsEnabled: false, stripeAccountId: { not: null } },
    },
    include: { organization: true },
    take: 100,
  });

  for (const e of events) {
    // Net owed to the organizer for THIS event (ticket money minus our fee minus refunds).
    const pays = await prisma.payment.findMany({
      where: { status: "CAPTURED", registration: { eventId: e.id } },
      select: { amountCents: true, platformFeeCents: true, refundedAmountCents: true },
    });
    const net = pays.reduce((n, p) => n + (p.amountCents - p.platformFeeCents - p.refundedAmountCents), 0);

    if (net <= 0) {                        // free event or fully refunded — nothing to send
      await prisma.event.update({ where: { id: e.id }, data: { payoutReleasedAt: new Date() } });
      continue;
    }

    // Don't overdraw: cap the payout at the connected account's available balance.
    const bal = await stripe.balance.retrieve({ stripeAccount: e.organization.stripeAccountId! });
    const available = bal.available.find((b) => b.currency === "usd")?.amount ?? 0;
    const amount = Math.min(net, available);
    if (amount <= 0) continue;             // balance not settled yet — retry next tick

    await stripe.payouts.create({ amount, currency: "usd" }, { stripeAccount: e.organization.stripeAccountId! });
    await prisma.event.update({ where: { id: e.id }, data: { payoutReleasedAt: new Date() } });
  }
}
```
Idempotent: `payoutReleasedAt` is the guard. A failed release leaves it null → retries next 5-min tick. Wrap the call in `tick()` exactly like the others:
```
try { await releaseEventPayouts(); } catch (e) { console.error("[worker] releaseEventPayouts error", e); Sentry.captureException(e, { tags: { job: "releaseEventPayouts" } }); }
```

### 3. Admin — the "trust" switch
On [`src/app/admin/orgs/[id]`](../src/app/admin/orgs/[id]) add a SUPERADMIN button **"Enable fast payouts"** that:
1. sets `org.fastPayoutsEnabled = true`, and
2. pushes the schedule to Stripe: `stripe.accounts.update(acct, { settings: { payouts: { schedule: { interval: "daily" } } } })`.

Audit-log it (`org.fast_payouts_enabled`) like the other admin actions. That's the entire promotion mechanism for Phase 0 — a human decides an org has earned it.

---

## Migration / backfill (important)
Your **existing** organizers are already on daily payouts with events in flight. Grandfather them so you don't suddenly freeze money mid-event:
- One-off: set `fastPayoutsEnabled = true` for all orgs that already exist (or at least those with a completed/published paid event).
- Only **new signups** get held.

(Decision below if you'd rather hold everyone.)

---

## Edge cases (already handled above)
- **Free / fully-refunded events:** `net <= 0` → marked released, no payout.
- **Unsettled balance:** `available < net` → skip, retry next tick (Stripe funds settle on a rolling basis).
- **Cancelled events:** excluded from release; the held balance stays available for refunds.
- **Multiple concurrent events for one held org:** each releases independently off its own `endAt` + per-event net. (Rare for new orgs.)

---

## What this buys you
- The **sell-500-tickets-then-cancel** scenario can't drain the platform — the money is still in Stripe to refund.
- Honest new organizers wait a few days after their event; proven ones get flipped to instant.
- ~**1 migration + ~60–80 lines** (2 fields, 1 worker job, 1 onboard tweak, 1 admin button + backfill). No change to checkout, fees, or refunds.

## Decisions needed
1. **`HOLD_DAYS`** — 3 days after `endAt`? (longer = safer, slower for organizers.)
2. **Grandfather existing orgs**, or hold everyone until manually promoted? (Recommend grandfather.)
3. **Promotion** — manual admin button only (Phase 0), or auto-flip after an org's first cleanly-released event? (Recommend manual to start; auto is a 10-line add later.)
