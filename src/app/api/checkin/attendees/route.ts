import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  const session = requireRole(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"], await getSession());
  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  // Verify caller's org owns this event (defense-in-depth)
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: session.orgId, deletedAt: null },
  });
  if (!event) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // STAFF/VOLUNTEER with explicit assignments must be assigned to this event
  if (session.role === "STAFF" || session.role === "VOLUNTEER") {
    const assignments = await prisma.eventAssignment.findMany({
      where: { userId: session.sub },
      select: { eventId: true },
    });
    if (assignments.length > 0 && !assignments.some((a) => a.eventId === event.id)) {
      return NextResponse.json({ error: "Not assigned to this event" }, { status: 403 });
    }
  }

  const tickets = await prisma.ticket.findMany({
    where: { registration: { eventId, status: "CONFIRMED" }, isValid: true },
    include: {
      registration: { include: { ticketType: { select: { name: true } } } },
      checkIn: { select: { scannedAt: true } },
    },
    orderBy: { attendeeName: "asc" },
    take: 5000,
  });

  return NextResponse.json({
    attendees: tickets.map((t) => ({
      ticketId: t.id,
      name: t.attendeeName,
      email: t.attendeeEmail,
      ticketType: t.registration.ticketType.name,
      company: t.registration.company,
      checkedIn: !!t.checkIn,
      checkedInAt: t.checkIn?.scannedAt ?? null,
    })),
  });
}
