import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRoleApi, orgScope } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { checkinWindow, checkinWindowState } from "@/lib/checkin-window";

const schema = z.object({
  ticketId: z.string().min(1),
  eventId: z.string().min(1),
  override: z.boolean().optional(),
});

const CAN_OVERRIDE_WINDOW = new Set(["ORGANIZER", "ADMIN", "SUPERADMIN"]);

/**
 * Manual check-in by ticket ID — for cases where the attendee doesn't have
 * their QR code (lost email, dead phone battery, walked up without scanning).
 * The staff member is already authenticated and verified to belong to this org.
 */
export async function POST(req: Request) {
  const session = await requireRoleApi(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"]);
  if (session instanceof NextResponse) return session;
  const ip = clientIp(req);
  const rl = await rateLimit(`checkin-manual:${session.sub}:${ip}`, 120, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many check-ins" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "INVALID", reason: "bad_payload" }, { status: 400 });

  // Verify event belongs to caller's org
  const event = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, ...orgScope(session), deletedAt: null },
  });
  if (!event) return NextResponse.json({ status: "INVALID", reason: "forbidden" }, { status: 403 });

  // STAFF/VOLUNTEER with explicit assignments must be assigned to this event
  if (session.role === "STAFF" || session.role === "VOLUNTEER") {
    const assignments = await prisma.eventAssignment.findMany({
      where: { userId: session.sub },
      select: { eventId: true },
    });
    if (assignments.length > 0 && !assignments.some((a) => a.eventId === event.id)) {
      return NextResponse.json({ status: "INVALID", reason: "not_assigned_to_event" }, { status: 403 });
    }
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: parsed.data.ticketId, isValid: true },
    include: { registration: true, checkIn: true },
  });
  if (!ticket) return NextResponse.json({ status: "INVALID", reason: "ticket_not_found" }, { status: 404 });
  if (ticket.registration.eventId !== event.id) {
    return NextResponse.json({ status: "INVALID", reason: "wrong_event" }, { status: 409 });
  }
  if (ticket.registration.status !== "CONFIRMED") {
    return NextResponse.json({ status: "INVALID", reason: "registration_not_confirmed" }, { status: 409 });
  }
  if (ticket.checkIn) {
    return NextResponse.json({
      status: "ALREADY_USED",
      attendee: ticket.attendeeName,
      checkedInAt: ticket.checkIn.scannedAt,
    }, { status: 409 });
  }

  // Same time-window gate as QR scan (see /api/checkin). event already carries
  // startAt/endAt + the window fields.
  const win = checkinWindow(event);
  const state = checkinWindowState(win, new Date());
  if (state !== "OPEN") {
    const canOverride = CAN_OVERRIDE_WINDOW.has(session.role);
    if (!canOverride) {
      return NextResponse.json({
        status: state === "TOO_EARLY" ? "NOT_OPEN" : "CLOSED",
        attendee: ticket.attendeeName,
        opensAt: win.opensAt.toISOString(),
        closesAt: win.closesAt.toISOString(),
      }, { status: 409 });
    }
    if (parsed.data.override !== true) {
      return NextResponse.json({
        status: "OUTSIDE_WINDOW",
        state,
        attendee: ticket.attendeeName,
        opensAt: win.opensAt.toISOString(),
        closesAt: win.closesAt.toISOString(),
      }, { status: 409 });
    }
    await audit({
      organizationId: event.organizationId,
      eventId: event.id,
      userId: session.sub,
      action: "checkin.window_override",
      targetType: "Ticket",
      targetId: ticket.id,
      metadata: { state, attendee: ticket.attendeeName, method: "manual", scannedAt: new Date().toISOString() },
    });
  }

  await prisma.checkIn.create({
    data: {
      ticketId: ticket.id,
      eventId: event.id,
      scannedBy: session.sub,
      method: "manual",
      outsideWindow: state !== "OPEN",
    },
  });

  return NextResponse.json({
    status: "CHECKED_IN",
    attendee: ticket.attendeeName,
    email: ticket.attendeeEmail,
    ticketId: ticket.id,
  });
}
