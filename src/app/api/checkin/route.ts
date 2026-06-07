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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "INVALID" }, { status: 400 });

  const decoded = await verifyTicketToken(parsed.data.token);
  if (!decoded || decoded.eventId !== parsed.data.eventId) {
    return NextResponse.json({ status: "INVALID" }, { status: 404 });
  }

  const hash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const ticket = await prisma.ticket.findFirst({
    where: { id: decoded.ticketId, qrCodeHash: hash, isValid: true },
    include: { registration: true, checkIn: true },
  });
  if (!ticket) return NextResponse.json({ status: "INVALID" }, { status: 404 });
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
