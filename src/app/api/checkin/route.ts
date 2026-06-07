import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSession, requireRole, verifyTicketToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(10), eventId: z.string() });

export async function POST(req: Request) {
  const session = requireRole(["ORGANIZER", "STAFF", "ADMIN"], await getSession());
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const rl = await rateLimit(`checkin:${session.sub}:${ip}`, 120, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many scans" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (body && typeof body.token === "string") body.token = body.token.trim();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "INVALID", reason: "bad_payload" }, { status: 400 });
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

  await prisma.checkIn.create({
    data: {
      ticketId: ticket.id,
      eventId: ticket.registration.eventId,
      scannedBy: session.sub,
      method: "qr",
    },
  });

  return NextResponse.json({
    status: "CHECKED_IN",
    attendee: ticket.attendeeName,
    email: ticket.attendeeEmail,
    registrationId: ticket.registrationId,
  });
}
