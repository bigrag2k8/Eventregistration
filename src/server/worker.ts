/**
 * Background worker — scheduled reminders, waitlist promotion, abandoned-cart recovery.
 * Run via `npm run worker`. Use a process manager (PM2 / Docker) in production.
 */
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendReminderEmail } from "@/lib/email";
import { issueTickets } from "@/server/tickets";

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
        event: { startAt: { gte: min, lte: max } },
        emailLogs: { none: { kind: b.kind } },
      },
      take: 200,
    });
    for (const r of regs) await sendReminderEmail(r.id, b.kind);
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
        data: { status: "PROMOTED", promotedAt: new Date(), expiresAt: new Date(Date.now() + ONE_DAY) },
      });
      // TODO: send promotion email with magic-link checkout
    }
  }
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

async function tick() {
  try {
    await sendReminders();
    await promoteWaitlist();
    await purgeAbandonedCarts();
  } catch (e) {
    console.error("worker tick error", e);
  }
}

const INTERVAL = 5 * 60 * 1000; // 5 minutes
console.log("Your Events App worker started");
tick();
setInterval(tick, INTERVAL);
