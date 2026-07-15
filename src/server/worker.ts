/**
 * Background worker — scheduled reminders, waitlist promotion, abandoned-cart recovery.
 * Run via `npm run worker`. Use a process manager (PM2 / Docker) in production.
 */
// Must be first: initializes Sentry (and its global crash handlers) before any
// other module is evaluated.
import { Sentry } from "@/server/instrument-worker";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { redis } from "@/lib/rate-limit";
import { sendReminderEmail, sendWaitlistPromotionEmail, sendEventCancelledEmail, sendEventRescheduledEmail, sendReviewRequestEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { issueTickets, releaseSeats, releasePromoUse, reissueTickets } from "@/server/tickets";
import { recomputeOrgReputation } from "@/server/reviews";
import { materializeOccurrences, computeOccurrences, ruleForSeries } from "@/server/series";

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

async function sendReminders() {
  const now = Date.now();
  const buckets: Array<{ kind: any; offsetMs: number; window: number }> = [
    { kind: "REMINDER_30D", offsetMs: 30 * ONE_DAY, window: ONE_HOUR },
    { kind: "REMINDER_7D",  offsetMs: 7  * ONE_DAY, window: ONE_HOUR },
    { kind: "REMINDER_1D",  offsetMs: 1  * ONE_DAY, window: ONE_HOUR },
    { kind: "REMINDER_1H",  offsetMs: ONE_HOUR,     window: 10 * 60 * 1000 },
  ];
  for (const b of buckets) {
    const target = new Date(now + b.offsetMs);
    const min = new Date(target.getTime() - b.window / 2);
    const max = new Date(target.getTime() + b.window / 2);
    const regs = await prisma.registration.findMany({
      where: {
        status: "CONFIRMED",
        event: { startAt: { gte: min, lte: max }, deletedAt: null, status: "PUBLISHED" },
        // QUEUED/SENT logs block resend; FAILED ones don't, so a rejected send
        // retries on later ticks — naturally bounded by the time window above.
        emailLogs: { none: { kind: b.kind, status: { not: "FAILED" } } },
      },
      take: 200,
    });
    for (const r of regs) {
      try {
        await sendReminderEmail(r.id, b.kind);
      } catch (e: any) {
        // One bad send must not abort the rest of the batch (previously a
        // single throw starved every remaining reminder AND the other jobs).
        console.error(`[worker] reminder ${b.kind} failed for reg ${r.id}:`, e?.message);
        Sentry.captureException(e, { tags: { job: "sendReminders", kind: b.kind }, extra: { regId: r.id } });
      }
    }
  }
}

async function promoteWaitlist() {
  // For each active event with capacity, if seats opened, promote next on list.
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED", waitlistEnabled: true, capacity: { not: null }, startAt: { gte: new Date() } },
    include: { ticketTypes: true },
  });
  for (const e of events) {
    const sold = e.ticketTypes.reduce((a, t) => a + t.quantitySold, 0);
    const open = (e.capacity ?? 0) - sold;
    if (open <= 0) continue;
    const queued = await prisma.waitlist.findMany({
      where: { eventId: e.id, status: "WAITING" }, orderBy: { position: "asc" }, take: open,
    });
    for (const w of queued) {
      await prisma.waitlist.update({
        where: { id: w.id },
        data: {
          status: "PROMOTED",
          promotedAt: new Date(),
          expiresAt: new Date(Date.now() + ONE_DAY),
          magicToken: crypto.randomBytes(24).toString("base64url"),
          leaveToken: w.leaveToken ?? crypto.randomBytes(24).toString("base64url"),
        },
      });
      try {
        await sendWaitlistPromotionEmail(w.id);
      } catch (e: any) {
        console.error(`[worker] waitlist promotion email failed for ${w.id}:`, e?.message);
      }
    }
  }

  await prisma.waitlist.updateMany({
    where: { status: "PROMOTED", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

async function purgeAbandonedCarts() {
  // Cancel pending registrations older than 30 min; mark abandoned cart for recovery emails.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const stale = await prisma.registration.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    take: 500,
  });
  for (const r of stale) {
    // Kill the Stripe session BEFORE cancelling, so a late payer can't pay a
    // session whose registration we just cancelled (which would leave money
    // with no ticket). If expire fails because the session was already paid,
    // skip cancellation and let the webhook confirm it.
    if (r.stripeSessionId) {
      try {
        await stripe.checkout.sessions.expire(r.stripeSessionId);
      } catch {
        try {
          const s = await stripe.checkout.sessions.retrieve(r.stripeSessionId);
          if (s.status === "complete" || s.payment_status === "paid") continue;
        } catch {
          // couldn't determine state — fall through and cancel
        }
      }
    }
    await prisma.registration.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelReason: "abandoned" } });
    // Release the seat (and any promo-code use) this abandoned reg was holding.
    await releaseSeats(prisma, r.ticketTypeId, r.quantity);
    await releasePromoUse(prisma, r.promoCodeId);
    await prisma.abandonedCart.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id, eventId: r.eventId, email: r.email, firstName: r.firstName,
        payload: { ticketTypeId: r.ticketTypeId, quantity: r.quantity } as any,
      },
    });
  }

  // Bundle purchases whose Stripe session lapsed: their per-session PENDING
  // registrations were just purged above (each carries the same session id),
  // so close out the parent purchase row too.
  await prisma.seriesBundlePurchase.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "CANCELLED" },
  });
}

// ── Phase 0 payout holds ────────────────────────────────────────────────────
// New organizers are onboarded with "manual" Stripe payouts, so their ticket
// money is HELD in Stripe. This job releases each event's net to the organizer
// 1 day after the event ends, and graduates an org to fast (daily) payouts once
// it has 5 clean released events with no lost disputes. See docs/Payout-Hold-Phase0.md.
const RELEASE_HOLD_DAYS = 1;
// Fix #1 — absolute floor: a charge is never released sooner than this many days
// after the customer actually paid, INDEPENDENT of endAt (which the organizer sets
// and can edit). endAt alone is gameable — set a fake-early end date, sell tickets,
// get paid a day later without running the event. Gating on the real charge date
// (the actual chargeback clock) closes that hole. Charges only age, so this never
// blocks a release forever.
const MIN_CHARGE_HOLD_DAYS = 7;
const CLEAN_EVENTS_TO_GRADUATE = 5;

async function releaseEventPayouts() {
  const cutoff = new Date(Date.now() - RELEASE_HOLD_DAYS * ONE_DAY);
  const events = await prisma.event.findMany({
    where: {
      payoutReleasedAt: null,
      deletedAt: null,
      status: { not: "CANCELLED" },
      endAt: { lt: cutoff },
      organization: { fastPayoutsEnabled: false, stripeAccountId: { not: null } },
    },
    include: { organization: { select: { id: true, stripeAccountId: true } } },
    take: 100,
  });

  for (const e of events) {
    const acct = e.organization.stripeAccountId!;
    // Net owed to the organizer for THIS event: paid ticket money − our fee − refunds.
    const pays = await prisma.payment.findMany({
      where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, registration: { eventId: e.id } },
      select: { amountCents: true, platformFeeCents: true, refundedAmountCents: true, createdAt: true },
    });
    const net = pays.reduce((n, p) => n + (p.amountCents - p.platformFeeCents - p.refundedAmountCents), 0);

    if (net <= 0) {
      // Free / fully-refunded event — nothing to send; mark done so we stop scanning it.
      await prisma.event.update({ where: { id: e.id }, data: { payoutReleasedAt: new Date() } });
      continue;
    }

    // Fix #1: hold every charge at least MIN_CHARGE_HOLD_DAYS from when it was paid,
    // regardless of endAt. Gate on the NEWEST charge so an organizer can't shorten
    // the hold with an early/edited end date. (pays is non-empty here since net > 0.)
    const newestChargeMs = Math.max(...pays.map((p) => p.createdAt.getTime()));
    if (Date.now() - newestChargeMs < MIN_CHARGE_HOLD_DAYS * ONE_DAY) continue;

    // Normally release only once the connected account's USD balance fully covers
    // the net (card funds settle ~2 business days after each charge) — never
    // partial-pay early. BUT an org demoted from fast→held mid-event already
    // banked part of its net via the old daily payouts, so its balance can never
    // reach the full net. After a 5-day grace past event end, release whatever is
    // available (up to net) and mark the event settled so it doesn't retry forever.
    const bal = await stripe.balance.retrieve({}, { stripeAccount: acct });
    const available = bal.available.find((b) => b.currency === "usd")?.amount ?? 0;
    const graceOver = Date.now() - e.endAt.getTime() > 5 * ONE_DAY;
    let amount = net;
    if (available < net) {
      if (!graceOver) continue; // still settling — retry next tick
      amount = Math.min(net, available); // pre-hold funds were already banked
    }

    if (amount > 0) {
      await stripe.payouts.create({ amount, currency: "usd" }, { stripeAccount: acct });
    }
    await prisma.event.update({ where: { id: e.id }, data: { payoutReleasedAt: new Date() } });
    await audit({
      organizationId: e.organization.id, eventId: e.id,
      action: "payout.released", targetType: "Event", targetId: e.id,
      metadata: { amountCents: amount, netCents: net, partial: amount < net, stripeAccountId: acct },
    });

    await maybeGraduateOrg(e.organization.id, acct);
  }
}

// Flip an org to fast (daily) payouts once it has 5 clean released events and no
// lost disputes. Idempotent — skips if already fast.
async function maybeGraduateOrg(orgId: string, acct: string) {
  const [cleanReleased, lostDisputes, org] = await Promise.all([
    prisma.event.count({ where: { organizationId: orgId, payoutReleasedAt: { not: null }, status: { not: "CANCELLED" }, deletedAt: null } }),
    prisma.dispute.count({ where: { organizationId: orgId, status: "lost" } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { fastPayoutsEnabled: true } }),
  ]);
  if (!org || org.fastPayoutsEnabled) return;                       // already fast
  if (cleanReleased < CLEAN_EVENTS_TO_GRADUATE || lostDisputes > 0) return;

  await stripe.accounts.update(acct, { settings: { payouts: { schedule: { interval: "daily" } } } });
  await prisma.organization.update({ where: { id: orgId }, data: { fastPayoutsEnabled: true } });
  await audit({
    organizationId: orgId, action: "payout.auto_graduated",
    targetType: "Organization", targetId: orgId,
    metadata: { cleanReleasedEvents: cleanReleased, trigger: `${CLEAN_EVENTS_TO_GRADUATE}_clean_events` },
  });
}

// ── Event cancellation refunds ──────────────────────────────────────────────
// When an organizer CANCELS an event (status CANCELLED, deletedAt null, cancelledAt
// set — NOT a soft delete), auto-refund every paid attendee IN FULL (ticket price +
// platform fee, per the cancellation policy) and email them. Idempotent: a Stripe
// idempotency key per registration means a retry never double-refunds, and each
// registration flips to REFUNDED so it's processed once. reverse_transfer pulls the
// money back from the organizer's Stripe balance (or, if it was already paid out,
// the platform absorbs the shortfall — that IS the buyer-protection guarantee).
async function refundCancelledEvents() {
  const events = await prisma.event.findMany({
    where: { status: "CANCELLED", deletedAt: null, cancelledAt: { not: null } },
    select: { id: true, name: true, organizationId: true },
    take: 20,
  });
  for (const e of events) {
    // Vendors first: a paid booth application's charge lives on its linked
    // Registration, so refund that and flip BOTH the application and its
    // registration to REFUNDED — which also removes it from the attendee loop
    // below (no double refund). Same full-refund + idempotency approach.
    const vendorApps = await prisma.vendorApplication.findMany({
      where: { eventId: e.id, status: "PAID", registrationId: { not: null } },
      take: 50,
    });
    for (const app of vendorApps) {
      try {
        const pay = await prisma.payment.findFirst({
          where: { registrationId: app.registrationId!, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (pay?.stripePaymentIntentId) {
          try {
            await stripe.refunds.create(
              {
                payment_intent: pay.stripePaymentIntentId,
                reverse_transfer: true,
                refund_application_fee: true,
                metadata: { reason: "event_cancelled", vendorApplicationId: app.id, eventId: e.id },
              },
              { idempotencyKey: `evtcancel-vendor:${app.id}` },
            );
          } catch (err: any) {
            if (err?.code !== "charge_already_refunded") {
              console.error(`[worker] cancel vendor-refund failed for app ${app.id}:`, err?.message);
              Sentry.captureException(err, { tags: { job: "refundCancelledEvents" }, extra: { vendorAppId: app.id } });
              continue;
            }
          }
        }
        await prisma.vendorApplication.update({ where: { id: app.id }, data: { status: "REFUNDED" } });
        await prisma.registration.update({
          where: { id: app.registrationId! },
          data: { status: "REFUNDED", cancelReason: "event_cancelled" },
        }).catch(() => {});
        try {
          await sendEventCancelledEmail(app.registrationId!, !!pay);
        } catch (e2: any) {
          console.error(`[worker] cancel vendor email failed for app ${app.id}:`, e2?.message);
        }
        await audit({
          organizationId: e.organizationId, eventId: e.id,
          action: "event_cancel.vendor_refund", targetType: "VendorApplication", targetId: app.id,
          metadata: { company: app.companyName, email: app.email, refunded: !!pay },
        });
      } catch (err) {
        console.error(`[worker] refundCancelledEvents vendor ${app.id} error`, err);
        Sentry.captureException(err, { tags: { job: "refundCancelledEvents" } });
      }
    }

    const regs = await prisma.registration.findMany({
      where: { eventId: e.id, status: "CONFIRMED" },
      include: { payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, take: 1 } },
      take: 50,
    });
    for (const reg of regs) {
      try {
        const pay = reg.payments[0];
        if (pay?.stripePaymentIntentId) {
          try {
            await stripe.refunds.create(
              {
                payment_intent: pay.stripePaymentIntentId,
                reverse_transfer: true,
                refund_application_fee: true, // full refund incl. platform fee
                // Bundle shares: N Payment rows share ONE PaymentIntent, so an
                // amount-less refund would return EVERY session's money for
                // this one cancelled session. Cap at this row's remaining share.
                ...(reg.bundlePurchaseId
                  ? { amount: Math.max(pay.amountCents - pay.refundedAmountCents, 1) }
                  : {}),
                metadata: { reason: "event_cancelled", registrationId: reg.id, eventId: e.id },
              },
              { idempotencyKey: `evtcancel:${reg.id}` },
            );
          } catch (err: any) {
            // Already fully refunded (e.g. webhook redelivery) is success; anything
            // else → leave the reg CONFIRMED so we retry next tick, and surface it.
            if (err?.code !== "charge_already_refunded") {
              console.error(`[worker] cancel-refund failed for reg ${reg.id}:`, err?.message);
              Sentry.captureException(err, { tags: { job: "refundCancelledEvents" }, extra: { regId: reg.id } });
              continue;
            }
          }
        }
        // Mark processed so we never touch it again (paid → REFUNDED; free → CANCELLED).
        // The charge.refunded webhook independently releases the seat + invalidates
        // tickets; both setting REFUNDED is idempotent.
        await prisma.registration.update({
          where: { id: reg.id },
          data: { status: pay ? "REFUNDED" : "CANCELLED", cancelReason: "event_cancelled" },
        });
        try {
          await sendEventCancelledEmail(reg.id, !!pay);
        } catch (e2: any) {
          console.error(`[worker] cancel email failed for reg ${reg.id}:`, e2?.message);
        }
        await audit({
          organizationId: e.organizationId, eventId: e.id,
          action: "event_cancel.refund", targetType: "Registration", targetId: reg.id,
          metadata: { email: reg.email, refunded: !!pay },
        });
      } catch (err) {
        console.error(`[worker] refundCancelledEvents reg ${reg.id} error`, err);
        Sentry.captureException(err, { tags: { job: "refundCancelledEvents" } });
      }
    }
  }
}

// ── Reschedule notifications ─────────────────────────────────────────────────
// After an organizer reschedules a live event, reissue every attendee's ticket
// (fresh QR expiry for the — possibly later — new date) and email them the new
// date + a refund option. Per-attendee dedup: process a registration whose
// rescheduleNotifiedAt is null or older than the event's rescheduledAt, so a
// SECOND reschedule re-notifies everyone. Async so a big event can't block the
// request.
async function processRescheduledEvents() {
  const events = await prisma.event.findMany({
    where: { rescheduledAt: { not: null }, deletedAt: null, status: "PUBLISHED" },
    select: { id: true, rescheduledAt: true },
    take: 20,
  });
  for (const e of events) {
    const regs = await prisma.registration.findMany({
      where: {
        eventId: e.id,
        status: "CONFIRMED",
        OR: [{ rescheduleNotifiedAt: null }, { rescheduleNotifiedAt: { lt: e.rescheduledAt! } }],
      },
      select: { id: true },
      take: 50,
    });
    for (const reg of regs) {
      try {
        await reissueTickets(reg.id).catch((err: any) => {
          // Don't let a reissue failure block the notification, but DON'T
          // swallow it silently either — a paid attendee with no scannable
          // ticket is a real incident. (sendEventRescheduledEmail also
          // self-heals by issuing tickets before it builds the QR.)
          console.error(`[worker] reschedule reissue failed for reg ${reg.id}:`, err?.message);
          Sentry.captureException(err, { tags: { job: "processRescheduledEvents", step: "reissue" }, extra: { regId: reg.id } });
        });
        await sendEventRescheduledEmail(reg.id);
        await prisma.registration.update({ where: { id: reg.id }, data: { rescheduleNotifiedAt: new Date() } });
      } catch (err) {
        console.error(`[worker] processRescheduledEvents reg ${reg.id} error`, err);
        Sentry.captureException(err, { tags: { job: "processRescheduledEvents" } });
      }
    }
  }
}

// ── Post-event review invites ────────────────────────────────────────────────
// A few hours after an event ends, email each verified (CONFIRMED) registrant a
// one-click star-rating invite. Per-registration dedup via reviewInvitedAt,
// stamped CLAIM-FIRST (before the send) so a crash or overlapping tick can't
// double-invite — we accept "no retry on a failed send" here rather than risk
// spamming attendees. Bounded to events that ended in the last 14 days so
// enabling the feature doesn't retroactively email months-old attendees.
const REVIEW_INVITE_MIN_AGE_MS = 3 * ONE_HOUR;
const REVIEW_INVITE_MAX_AGE_MS = 14 * ONE_DAY;

async function inviteEventReviews() {
  const now = Date.now();
  const regs = await prisma.registration.findMany({
    where: {
      status: "CONFIRMED",
      reviewInvitedAt: null,
      event: {
        status: "PUBLISHED",
        deletedAt: null,
        endAt: { lt: new Date(now - REVIEW_INVITE_MIN_AGE_MS), gte: new Date(now - REVIEW_INVITE_MAX_AGE_MS) },
      },
    },
    select: { id: true },
    take: 200,
  });
  for (const r of regs) {
    // Claim first: stamp, then send. If the send throws we don't retry (one
    // invite per attendee is the intent), but we're guaranteed not to double-send.
    await prisma.registration.update({ where: { id: r.id }, data: { reviewInvitedAt: new Date() } });
    try {
      await sendReviewRequestEmail(r.id);
    } catch (e: any) {
      console.error(`[worker] review invite failed for reg ${r.id}:`, e?.message);
      Sentry.captureException(e, { tags: { job: "inviteEventReviews" }, extra: { regId: r.id } });
    }
  }
}

// One follow-up nudge for attendees who were invited but never reviewed —
// sent REVIEW_REMINDER_DELAY after the invite, exactly once (reviewRemindedAt,
// claim-first like the invite). Skips anyone who already has a review.
const REVIEW_REMINDER_DELAY_MS = 3 * ONE_DAY;

async function remindEventReviews() {
  const cutoff = new Date(Date.now() - REVIEW_REMINDER_DELAY_MS);
  const regs = await prisma.registration.findMany({
    where: {
      status: "CONFIRMED",
      reviewInvitedAt: { lt: cutoff },
      reviewRemindedAt: null,
      review: null,
      event: { status: "PUBLISHED", deletedAt: null },
    },
    select: { id: true },
    take: 200,
  });
  for (const r of regs) {
    await prisma.registration.update({ where: { id: r.id }, data: { reviewRemindedAt: new Date() } });
    try {
      await sendReviewRequestEmail(r.id, { reminder: true });
    } catch (e: any) {
      console.error(`[worker] review reminder failed for reg ${r.id}:`, e?.message);
      Sentry.captureException(e, { tags: { job: "remindEventReviews" }, extra: { regId: r.id } });
    }
  }
}

// Keep reputation scores fresh: reviews recompute inline on submit, but the
// operational inputs (cancellations, disputes, payout graduation) move outside
// the review flow. Sweep the stalest orgs each tick — at 50/tick every org
// refreshes at least hourly up to ~600 orgs, far beyond current scale.
async function recomputeReputationScores() {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null, events: { some: { status: { in: ["PUBLISHED", "CANCELLED"] } } } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  for (const o of orgs) {
    try {
      await recomputeOrgReputation(o.id);
    } catch (e: any) {
      console.error(`[worker] reputation recompute failed for org ${o.id}:`, e?.message);
      Sentry.captureException(e, { tags: { job: "recomputeReputationScores" }, extra: { orgId: o.id } });
    }
  }
}

// ── Recurring series: rolling occurrence generation ─────────────────────────
// Each ACTIVE series keeps ~SERIES_HORIZON_DAYS of future occurrences
// materialized as real Event rows (so a weekly class always shows its next few
// months without pre-creating hundreds of rows). Generation is idempotent, so
// each tick just fills the newly-in-window dates. A bounded series (end date or
// occurrence cap) flips to ENDED once its final occurrence is in the past.
const SERIES_HORIZON_DAYS = 90;

async function extendSeriesHorizon() {
  const seriesList = await prisma.eventSeries.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const horizon = new Date(Date.now() + SERIES_HORIZON_DAYS * ONE_DAY);
  for (const s of seriesList) {
    try {
      await materializeOccurrences(s.id, horizon);
      // Only bounded series can end; open-ended ones roll forever (cancelling
      // every current session there is temporary — the horizon generates more).
      if (s.seriesEnd || s.occurrenceCap != null) {
        const far = new Date(Date.now() + 5 * 365 * ONE_DAY);
        const all = computeOccurrences(ruleForSeries(s), far);
        const last = all[all.length - 1];
        const lastDatePassed = !last || last.start.getTime() < Date.now();

        // A bounded series is ALSO over when every session it will ever have is
        // cancelled: no live session remains and every occurrence the rule can
        // produce already exists, so nothing new will ever generate. Without
        // this the series sits at ACTIVE forever with nothing running — which
        // reads as a live series to the organizer.
        let noLiveSessionsLeft = false;
        if (!lastDatePassed) {
          const existing = await prisma.event.findMany({
            where: { seriesId: s.id, deletedAt: null },
            select: { occurrenceIndex: true, status: true, endAt: true },
          });
          const haveIdx = new Set(existing.map((e) => e.occurrenceIndex));
          const nothingLeftToGenerate = all.every((o) => haveIdx.has(o.index));
          const now = new Date();
          const hasLiveUpcoming = existing.some((e) => e.status !== "CANCELLED" && e.endAt >= now);
          noLiveSessionsLeft = nothingLeftToGenerate && !hasLiveUpcoming;
        }

        if (lastDatePassed || noLiveSessionsLeft) {
          await prisma.eventSeries.update({ where: { id: s.id }, data: { status: "ENDED" } });
        }
      }
    } catch (e: any) {
      console.error(`[worker] extendSeriesHorizon failed for series ${s.id}:`, e?.message);
      Sentry.captureException(e, { tags: { job: "extendSeriesHorizon" }, extra: { seriesId: s.id } });
    }
  }
}

const INTERVAL = 5 * 60 * 1000; // 5 minutes
const LOCK_KEY = "worker:tick:lock";
const LOCK_TTL_MS = INTERVAL - 60 * 1000; // expires before the next tick — no deadlock if we crash mid-tick

/**
 * Best-effort distributed lock so an overlapping deploy (old + new worker both
 * alive for a minute) or an accidental second replica doesn't double-send
 * every reminder. Fails OPEN when Redis is down — a single worker keeps
 * running, and the QUEUED-first EmailLog claim is the second line of defense.
 */
async function acquireTickLock(): Promise<boolean> {
  try {
    const ok = await redis().set(LOCK_KEY, String(process.pid), "PX", LOCK_TTL_MS, "NX");
    return ok === "OK";
  } catch {
    return true; // Redis unavailable — don't stop the only worker
  }
}

async function tick() {
  if (!(await acquireTickLock())) {
    console.log("[worker] another worker holds the tick lock — skipping");
    return;
  }
  // Run the jobs independently: a failure in one must not starve the others
  // (previously one thrown send skipped waitlist promotion and cart purging).
  try { await sendReminders(); } catch (e) { console.error("[worker] sendReminders error", e); Sentry.captureException(e, { tags: { job: "sendReminders" } }); }
  try { await promoteWaitlist(); } catch (e) { console.error("[worker] promoteWaitlist error", e); Sentry.captureException(e, { tags: { job: "promoteWaitlist" } }); }
  try { await purgeAbandonedCarts(); } catch (e) { console.error("[worker] purgeAbandonedCarts error", e); Sentry.captureException(e, { tags: { job: "purgeAbandonedCarts" } }); }
  try { await releaseEventPayouts(); } catch (e) { console.error("[worker] releaseEventPayouts error", e); Sentry.captureException(e, { tags: { job: "releaseEventPayouts" } }); }
  try { await refundCancelledEvents(); } catch (e) { console.error("[worker] refundCancelledEvents error", e); Sentry.captureException(e, { tags: { job: "refundCancelledEvents" } }); }
  try { await processRescheduledEvents(); } catch (e) { console.error("[worker] processRescheduledEvents error", e); Sentry.captureException(e, { tags: { job: "processRescheduledEvents" } }); }
  try { await inviteEventReviews(); } catch (e) { console.error("[worker] inviteEventReviews error", e); Sentry.captureException(e, { tags: { job: "inviteEventReviews" } }); }
  try { await remindEventReviews(); } catch (e) { console.error("[worker] remindEventReviews error", e); Sentry.captureException(e, { tags: { job: "remindEventReviews" } }); }
  try { await recomputeReputationScores(); } catch (e) { console.error("[worker] recomputeReputationScores error", e); Sentry.captureException(e, { tags: { job: "recomputeReputationScores" } }); }
  try { await extendSeriesHorizon(); } catch (e) { console.error("[worker] extendSeriesHorizon error", e); Sentry.captureException(e, { tags: { job: "extendSeriesHorizon" } }); }
}

// Apply pending migrations BEFORE the first tick. Railway starts web and worker
// simultaneously; the worker's immediate tick used to race the web service's
// migrate-at-boot and fail with P2022 on brand-new columns (one tick of Sentry
// noise per migration deploy). prisma migrate deploy holds a DB advisory lock,
// so when both services run it, one applies and the other waits then no-ops.
// Done here in code (not the start command) so EVERY launch path is covered —
// Railway's custom start command, docker-compose, and npm run worker alike.
// Best-effort: if it fails we still start; jobs catch their own errors and the
// web service remains the primary migrator.
try {
  console.log("[worker-boot] prisma migrate deploy (waits on advisory lock if web is applying)");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("child_process").execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (e: any) {
  console.error("[worker-boot] migrate deploy failed — starting anyway:", e?.message);
}

console.log("Your Events App worker started");
tick();
setInterval(tick, INTERVAL);
