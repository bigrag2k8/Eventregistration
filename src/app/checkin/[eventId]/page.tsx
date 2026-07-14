import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { CheckinScanner } from "@/components/CheckinScanner";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ params }: { params: { eventId: string } }) {
  // Middleware gates the role; this gates the org — staff of another org must
  // not see this event's name or check-in counts.
  const session = requireRole(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.eventId, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const [total, checked] = await Promise.all([
    prisma.ticket.count({
      where: { registration: { eventId: event.id, status: "CONFIRMED" }, isValid: true },
    }),
    prisma.checkIn.count({ where: { eventId: event.id } }),
  ]);

  return <CheckinScanner eventId={event.id} eventName={event.name} eventTimezone={event.timezone} initialTotal={total} initialChecked={checked} />;
}
