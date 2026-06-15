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
import { sendReminderEmail, sendWaitlistPromotionEmail } from "@/lib/email";
import { issueTickets, releaseSeats, releasePromoUse } from "@/server/tickets";

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
}

console.log("Your Events App worker started");
tick();
setInterval(tick, INTERVAL);
