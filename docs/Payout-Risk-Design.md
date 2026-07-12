# Design: Organizer Trust Tiers & Event-Gated Payout Holds

**Status:** Proposal · **Author:** drafted with Claude · **Date:** 2026-06-27
**Problem owner:** platform finance/risk

---

## 1. Problem & current exposure

The platform carries **uncapped liability** for organizer cancellation and fraud. Three facts in the current code combine into the worst case:

1. **Destination charges** — every ticket charge is created on the platform account and the funds are routed to the organizer's connected account (`transfer_data.destination`). See [`src/lib/connect.ts`](../src/lib/connect.ts) `connectChargeParams()`.
2. **Daily payouts for everyone** — [`src/app/api/billing/connect/onboard/route.ts`](../src/app/api/billing/connect/onboard/route.ts) hardcodes `settings.payouts.schedule.interval = "daily"`, so an organizer's balance is swept to their **bank** every day (intentionally "faster than Eventbrite's 3-day hold").
3. **Platform is liable for losses** — the Connect controller sets `losses.payments = "application"`. Chargebacks and negative balances land on **us**, not the organizer.

And **cancel = soft-delete only** — [`deleteAction`](../src/app/dashboard/events/[id]/actions.ts) sets `deletedAt` + `status: "CANCELLED"` with **no refund, clawback, or hold**.

### The failure scenario
Organizer sells 500 × $50 = **$25,000** over a few weeks → ~$23,750 (net of fee) is paid to their **bank daily** → by event day the money has left Stripe → organizer cancels or no-shows → 500 attendees chargeback → because `losses.payments = "application"`, the platform repays **~$25,000 + ~$15/dispute × 500 ≈ $7,500 in dispute fees**, while the organizer keeps the cash already in their bank.

**Nothing structural prevents this today.** Stripe Radar covers stolen-card fraud, not delivery risk. Stripe's own reserves protect Stripe, not us. Since we took the liability (`losses=application`), we must build the protection.

---

## 2. Goals & non-goals

**Goals**
- Make the "sell big, cancel, vanish" scenario non-catastrophic: the money is still in Stripe to refund.
- Keep fast payouts as a **reward for proven organizers** (preserve the competitive edge for the accounts that earn it).
- Be automatic: tiers promote/demote without manual ops in the common case.
- Minimal re-architecture — work with the existing destination-charge flow.

**Non-goals (this round)**
- Separate charges & transfers re-architecture (noted as a later hardening option, §9).
- Instant payouts (a future PREMIUM tier).
- Replacing Stripe's KYC (we consume it).

---

## 3. The model: trust tiers + event-gated holds

Two ideas, applied together:

- **Account trust tier** decides the organizer's *default* payout speed.
- **Per-event risk** can override a trusted account down to "held" for an unusually large or far-out event.

The core mechanic: **held** accounts get `payouts.schedule.interval = "manual"`, so ticket money accumulates in their Stripe **balance** (not their bank). A worker job releases it **after the event happens** (`event.endAt + holdDays`). Until then it's available to refund attendees.

| Tier | Graduation criteria (defaults — tune in §10) | Payout behavior | Per-event sales cap |
|---|---|---|---|
| `BLOCKED` | KYC incomplete (`!chargesEnabled` or `!payoutsEnabled`) | cannot sell | — |
| `NEW` | KYC ok, 0 clean completed events | **manual**; release at `endAt + 5d` | $5,000 |
| `ESTABLISHED` | ≥2 clean events, dispute rate <0.5%, age ≥30d, 0 open disputes | **manual**; release at `endAt + 2d` | $25,000 |
| `TRUSTED` | ≥5 clean events, ≥$25k clean volume, dispute rate <0.3%, age ≥90d, 0 open disputes | **daily** (current behavior) | none |
| `PREMIUM` *(future)* | long high-volume history | instant payouts | none |

**Demotion is instant** on: a lost dispute in the last 30d, a CANCELLED event with unrefunded paid registrations, or a dispute-rate spike. Demotion switches the Stripe schedule back to `manual` to cap *future* exposure (money already in their bank can't be recovered — which is exactly why we hold new accounts).

---

## 4. Schema changes (Prisma)

All additions are nullable / defaulted → **non-destructive** migration (follow the SEC-04 `migrate dev → commit → migrate deploy` path, not `db push`).

```prisma
// enum
enum TrustTier { BLOCKED NEW ESTABLISHED TRUSTED PREMIUM }
enum PayoutMode { HELD IMMEDIATE }   // resolved per-event at publish time

model Organization {
  // ...existing stripeAccount* fields...
  trustTier            TrustTier @default(NEW)
  trustTierUpdatedAt   DateTime?
  /// Cached payout schedule we last pushed to Stripe ("manual" | "daily"), so we
  /// only call accounts.update when it actually changes.
  payoutSchedule       String?   @default("manual")
}

model Event {
  // ...existing fields...
  /// Resolved at publish: HELD (release after event) or IMMEDIATE (org is TRUSTED+
  /// and event is below the risk thresholds). Drives the release job.
  payoutMode           PayoutMode @default(HELD)
  /// Set by the worker once held funds for this event have been released.
  payoutReleasedAt     DateTime?
}

/// Audit + idempotency for released holds. One row per release attempt.
model PayoutRelease {
  id              String   @id @default(cuid())
  eventId         String
  organizationId  String
  amountCents     Int
  stripePayoutId  String?  @unique   // null until Stripe confirms
  status          String              // 'pending' | 'paid' | 'failed'
  createdAt       DateTime @default(now())
  @@index([organizationId, createdAt])
}
```

---

## 5. Trust score / tier computation

A pure function the worker (and an admin "recompute" action) calls. All inputs come from existing tables.

```
computeTrustTier(org) -> TrustTier

inputs (per org, from DB):
  kycOk              = stripeAccountChargesEnabled && stripeAccountPayoutsEnabled && stripeAccountDetailsSubmitted
  accountAgeDays     = days since org.createdAt
  cleanCompletedEvents = count(Event where endAt < now, status != CANCELLED, deletedAt null,
                               payoutReleasedAt not null, and 0 LOST disputes on its payments)
  totalProcessedCents  = sum(Payment.amountCents where status = CAPTURED for this org's events)
  paidTxns            = count(Payment status = CAPTURED)
  disputeRate         = count(Dispute for org) / max(paidTxns, 1)
  openDisputes        = count(Dispute where status in {needs_response, under_review, warning_*})
  recentLostDispute   = exists(Dispute status = lost, createdAt > now-30d)
  unrefundedCancelled = exists(Event status=CANCELLED with CONFIRMED paid regs not fully refunded)

rules (first match wins):
  !kycOk                                   -> BLOCKED
  recentLostDispute || unrefundedCancelled -> NEW            // hard demote
  meets TRUSTED thresholds                 -> TRUSTED
  meets ESTABLISHED thresholds             -> ESTABLISHED
  else                                     -> NEW
```

Dispute linkage already exists: `Dispute.organizationId` and `Payment.disputes[]`. "Clean completed event" = event whose payments carry no `lost` disputes after the release window.

---

## 6. Payout-hold mechanism (the three wiring points)

### 6a. Onboarding — schedule by tier
In [`connect/onboard/route.ts`](../src/app/api/billing/connect/onboard/route.ts), replace the hardcoded `interval: "daily"` with the tier's schedule. New accounts (`NEW`) start `manual`. Persist `org.payoutSchedule`.

### 6b. Publish — resolve `Event.payoutMode`
When an event is published, set `payoutMode`:
```
IMMEDIATE  if org.trustTier == TRUSTED|PREMIUM AND projectedGross < RISK_GROSS_CAP ($50k)
                                               AND leadDays(now -> startAt) < RISK_LEAD_DAYS (60)
HELD       otherwise
```
This is the per-event override: even a TRUSTED org's unusually large/far-out event is held.

### 6c. Release — new worker job
Add to [`src/server/worker.ts`](../src/server/worker.ts) `tick()` (same independent-try/catch pattern as the other jobs):

```
async function releaseScheduledPayouts() {
  holdDays = { NEW: 5, ESTABLISHED: 2 }
  events = Event where payoutMode = HELD
                   and status != CANCELLED, deletedAt null
                   and payoutReleasedAt is null
                   and endAt + holdDays(org.trustTier) < now
  for each event:
    net = sum(Payment.amountCents - platformFeeCents - refundedAmountCents
              for CAPTURED, non-fully-refunded payments on this event's regs)
    if net <= 0: mark payoutReleasedAt; continue
    create PayoutRelease(status=pending, amountCents=net)              // idempotency guard
    payout = stripe.payouts.create({ amount: net, currency },
                                   { stripeAccount: org.stripeAccountId })
    update PayoutRelease(status=paid, stripePayoutId=payout.id)
    set event.payoutReleasedAt = now
}
```
Funds sit in the connected account's Stripe balance until this runs; the platform (as controller) triggers the bank payout on behalf of the account. Wrap in `try/catch` + `Sentry.captureException` like the existing jobs; a failed release leaves `payoutReleasedAt` null so it retries next tick.

> **Optional rolling reserve (Phase 2):** release `net * (1 - RESERVE_PCT)` and schedule the remainder for `endAt + 90d` to cover the ~120-day chargeback tail.

---

## 7. Promotion & demotion triggers

- **Promotion:** the `releaseScheduledPayouts` job (or a small nightly job) calls `computeTrustTier(org)` after each event releases cleanly. If the tier rises, push the new schedule via `stripe.accounts.update(acct, { settings: { payouts: { schedule: { interval }}}})` and update `org.payoutSchedule`.
- **Demotion:** in the existing dispute webhook handler `handleDisputeEvent` (`src/server/billing.ts`, fed by `charge.dispute.*`) and in `deleteAction` (event cancel with unrefunded paid regs), call `computeTrustTier`; if it drops, switch the schedule to `manual` immediately. This caps future payouts even though already-banked funds are gone.

---

## 8. Enforcement of sales caps

Per-event/per-tier sales caps are enforced at **registration creation** ([`src/app/api/registrations/route.ts`](../src/app/api/registrations/route.ts)) — the same chokepoint that already enforces the FREE 50-registration cap. Reject with a friendly `ErrorBanner` code (e.g. `tier_sales_cap`) when an org would exceed its tier's cap on an event.

---

## 9. Edge cases & decisions baked in

- **Existing organizers (migration):** default all current orgs to a tier via a one-off `computeTrustTier` backfill so the few real accounts (e.g. the org with 5 completed charges) land in the right bucket instead of everyone snapping to NEW.
- **Free events / $0 regs:** `payoutMode` irrelevant (no money) — release job skips `net <= 0`.
- **Multi-day events:** hold is keyed off `endAt`, which is already a required non-null column.
- **Partial refunds before release:** handled — `net` subtracts `refundedAmountCents`, so a held event that refunded some attendees releases only the remainder.
- **Demotion can't claw back banked money:** accepted limitation. The protection is *preventive* (hold new accounts up front), not *recovery* after the fact.
- **Connected balance vs platform balance:** with destination charges the held funds live in the *connected account's* Stripe balance. That's refundable (refund reverses the transfer) — sufficient for the core scenario. **Stronger alternative (Phase 3):** switch to **separate charges & transfers**, so funds sit in the *platform* balance and we only transfer to the organizer post-event. Bigger change (charge creation, refunds, statement descriptor, fee handling) — deferred.
- **Chargeback tail (~120 days):** post-event hold catches the "event never happened" wave; the optional rolling reserve (§6c) covers the long tail for high-volume accounts.

---

## 10. Open decisions (need product/finance sign-off)

1. **Hold windows:** NEW = `endAt + 5d`, ESTABLISHED = `endAt + 2d`? (longer = safer, slower for organizers.)
2. **Graduation thresholds:** events-completed counts, dispute-rate ceilings, volume floor, account-age minimums (§3 table).
3. **Per-event risk override:** `RISK_GROSS_CAP` ($50k?) and `RISK_LEAD_DAYS` (60?).
4. **Sales caps per tier:** $5k / $25k / none — or no hard cap, holds only?
5. **Rolling reserve:** ship in Phase 1 or defer? `RESERVE_PCT` and reserve window if yes.
6. **Partial early payout for ESTABLISHED** (e.g. 50% pre-event) — nice-to-have or skip?

---

## 11. Rollout plan

- **Phase 1 (core protection):** schema fields + `computeTrustTier` + conditional onboard schedule + `payoutMode` at publish + `releaseScheduledPayouts` worker job + backfill existing orgs. This alone neutralizes the failure scenario.
- **Phase 2 (refinement):** sales caps, rolling reserve, partial early payouts, admin tier override + visibility on `/admin/orgs/[id]`.
- **Phase 3 (hardening):** separate charges & transfers; PREMIUM instant-payout tier.

**Estimated scope (Phase 1):** ~1 migration + ~200–300 lines (a tier module, a worker job, the onboard tweak, the publish hook, the demotion hooks, the backfill). No change to the checkout/charge path itself.

---

## 12. What this does NOT change
- Checkout, fee calc (`connectChargeParams`), and the refund model are untouched in Phase 1.
- Trusted/premium organizers keep daily/fast payouts — only new and high-risk events are held.
