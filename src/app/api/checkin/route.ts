import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireRoleApi, orgScope, verifyTicketToken } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { checkinWindow, checkinWindowState } from "@/lib/checkin-window";

const schema = z.object({
  token: z.string().min(10),
  eventId: z.string(),
  // Set by the client after an ORGANIZER confirms an outside-the-window scan.
  override: z.boolean().optional(),
});

const CAN_OVERRIDE_WINDOW = new Set(["ORGANIZER", "ADMIN", "SUPERADMIN"]);

export async function POST(req: Request) {
  const session = await requireRoleApi(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"]);
  if (session instanceof NextResponse) return session;
  const ip = clientIp(req);
  const rl = await rateLimit(`checkin:${session.sub}:${ip}`, 120, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many scans" }, { status: 429 });

  // For STAFF/VOLUNTEER with explicit assignments, verify they're assigned to this event
  if (session.role === "STAFF" || session.role === "VOLUNTEER") {
    const body = await req.clone().json().catch(() => null);
    const eventId = body?.eventId;
    if (eventId) {
      const assignments = await prisma.eventAssignment.findMany({
        where: { userId: session.sub },
        select: { eventId: true },
      });
      if (assignments.length > 0 && !assignments.some((a) => a.eventId === eventId)) {
        return NextResponse.json({ status: "INVALID", reason: "not_assigned_to_event" }, { status: 403 });
      }
    }
  }

  const body = await req.json().catch(() => null);
  if (body && typeof body.token === "string") body.token = body.token.trim();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "INVALID", reason: "bad_payload" }, { status: 400 });
  }

  // The event must belong to the scanner's org (SUPERADMIN excepted) — without
  // this, staff of ANY org could consume tickets on another org's event.
  const scopedEvent = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, ...orgScope(session), deletedAt: null },
    select: {
      id: true, organizationId: true, startAt: true, endAt: true,
      checkinOpensMinutesBefore: true, checkinClosesMinutesAfter: true,
    },
  });
  if (!scopedEvent) {
    return NextResponse.json({ status: "INVALID", reason: "event_not_found" }, { status: 404 });
  }

  const decoded = await verifyTicketToken(parsed.data.token);
  if (!decoded) {
    return NextResponse.json({ status: "INVALID", reason: "bad_signature" }, { status: 404 });
  }
  if (decoded.eventId !== parsed.data.eventId) {
    return NextResponse.json({ status: "INVALID", reason: "wrong_event" }, { status: 404 });
  }

  const hash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const ticket = await prisma.ticket.findFirst({
    where: { id: decoded.ticketId, qrCodeHash: hash, isValid: true },
    include: { registration: true, checkIn: true },
  });
  if (!ticket) {
    // Look it up by id alone to give a better hint
    const idOnly = await prisma.ticket.findFirst({ where: { id: decoded.ticketId } });
    if (!idOnly) return NextResponse.json({ status: "INVALID", reason: "ticket_not_found" }, { status: 404 });
    if (!idOnly.isValid) return NextResponse.json({ status: "INVALID", reason: "ticket_invalidated" }, { status: 404 });
    return NextResponse.json({ status: "INVALID", reason: "hash_mismatch" }, { status: 404 });
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

  // Time-window gate: block scans outside [opensAt, closesAt]. STAFF/VOLUNTEER
  // are hard-blocked; ORGANIZER/ADMIN can override by re-submitting with
  // override:true (the client shows a confirm first). Overrides are audited.
  const win = checkinWindow(scopedEvent);
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
      organizationId: scopedEvent.organizationId,
      eventId: scopedEvent.id,
      userId: session.sub,
      action: "checkin.window_override",
      targetType: "Ticket",
      targetId: ticket.id,
      metadata: { state, attendee: ticket.attendeeName, method: "qr", scannedAt: new Date().toISOString() },
    });
  }

  try {
    await prisma.checkIn.create({
      data: {
        ticketId: ticket.id,
        eventId: ticket.registration.eventId,
        scannedBy: session.sub,
        method: "qr",
        outsideWindow: state !== "OPEN",
      },
    });
  } catch (e: any) {
    // Two staff scanning the same ticket in the same instant: the loser hits
    // the unique ticketId constraint — report "already used", not a 500.
    if (e?.code === "P2002") {
      return NextResponse.json({ status: "ALREADY_USED", attendee: ticket.attendeeName }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({
    status: "CHECKED_IN",
    attendee: ticket.attendeeName,
    email: ticket.attendeeEmail,
    registrationId: ticket.registrationId,
  });
}
