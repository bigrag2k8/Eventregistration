import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope, verifyTicketToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(10), eventId: z.string() });

export async function POST(req: Request) {
  const session = requireRole(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"], await getSession());
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
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
    select: { id: true },
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

  try {
    await prisma.checkIn.create({
      data: {
        ticketId: ticket.id,
        eventId: ticket.registration.eventId,
        scannedBy: session.sub,
        method: "qr",
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
