import { prisma } from "@/lib/db";
import { dayIndexOf, ticketCoversDay } from "@/lib/conference";

/**
 * Per-session seat reservations (Slice 2). Availability is computed LIVE — the
 * count of SEAT reservations under a `SELECT … FOR UPDATE` row-lock on the
 * session — rather than a stored counter, so a cancelled/refunded registration
 * frees its seat automatically via cascade delete (no counter to keep in sync).
 * This mirrors the FOR-UPDATE tx shape in src/app/api/registrations/route.ts.
 */

export type ReserveResult =
  | { ok: true; status: "SEAT" | "WAITLIST" }
  | { ok: false; reason: "not_confirmed" | "uncapped" | "day_locked" | "wrong_event" };

/** Reserve a seat in a capacity-limited session, or join its waitlist if full. */
export async function reserveOrWaitlistSession(
  registrationId: string,
  sessionId: string,
): Promise<ReserveResult> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { ticketType: true, event: true },
  });
  if (!reg) return { ok: false, reason: "wrong_event" };
  if (reg.status !== "CONFIRMED") return { ok: false, reason: "not_confirmed" };

  const session = await prisma.eventSession.findUnique({ where: { id: sessionId } });
  if (!session || session.eventId !== reg.eventId) return { ok: false, reason: "wrong_event" };
  if (session.capacity == null) return { ok: false, reason: "uncapped" }; // no reservation needed
  const cap = session.capacity;

  // dayAccess enforcement: the ticket must cover the day this session falls on.
  if (!ticketCoversDay(reg.ticketType.dayAccess, dayIndexOf(session.startAt, reg.event))) {
    return { ok: false, reason: "day_locked" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent reservations for THIS session so the live count
      // below can't be raced (same technique the registration tx uses on events).
      await tx.$executeRaw`SELECT id FROM event_sessions WHERE id = ${sessionId} FOR UPDATE`;
      const seated = await tx.sessionReservation.count({ where: { sessionId, status: "SEAT" } });
      if (seated < cap) {
        await tx.sessionReservation.create({ data: { sessionId, registrationId, status: "SEAT" } });
        return { ok: true, status: "SEAT" as const };
      }
      const max = await tx.sessionReservation.aggregate({
        where: { sessionId, status: "WAITLIST" },
        _max: { position: true },
      });
      await tx.sessionReservation.create({
        data: { sessionId, registrationId, status: "WAITLIST", position: (max._max.position ?? 0) + 1 },
      });
      return { ok: true, status: "WAITLIST" as const };
    });
  } catch (e: unknown) {
    // Unique(sessionId, registrationId) — already reserved. Idempotent: report
    // the current state rather than erroring.
    if ((e as { code?: string })?.code === "P2002") {
      const existing = await prisma.sessionReservation.findUnique({
        where: { sessionId_registrationId: { sessionId, registrationId } },
      });
      return { ok: true, status: existing?.status ?? "SEAT" };
    }
    throw e;
  }
}

/**
 * Release the caller's seat (or leave the waitlist). If a SEAT is freed and
 * anyone is waiting, promote the earliest waitlister to SEAT INLINE (instant —
 * a 5-minute worker delay is too slow during a live conference) and return its
 * id so the caller can email the promoted attendee. The worker job is a backstop
 * for seats freed by cancellations/refunds and capacity bumps.
 */
export async function releaseSession(
  registrationId: string,
  sessionId: string,
): Promise<{ promotedReservationId: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM event_sessions WHERE id = ${sessionId} FOR UPDATE`;
    const mine = await tx.sessionReservation.findUnique({
      where: { sessionId_registrationId: { sessionId, registrationId } },
    });
    if (!mine) return { promotedReservationId: null };
    const wasSeat = mine.status === "SEAT";
    await tx.sessionReservation.delete({ where: { id: mine.id } });
    if (!wasSeat) return { promotedReservationId: null };

    const next = await tx.sessionReservation.findFirst({
      where: { sessionId, status: "WAITLIST" },
      orderBy: { position: "asc" },
    });
    if (!next) return { promotedReservationId: null };
    await tx.sessionReservation.update({ where: { id: next.id }, data: { status: "SEAT" } });
    return { promotedReservationId: next.id };
  });
}
