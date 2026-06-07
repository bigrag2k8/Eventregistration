import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CheckinScanner } from "@/components/CheckinScanner";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ params }: { params: { eventId: string } }) {
  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) return notFound();

  const [total, checked] = await Promise.all([
    prisma.ticket.count({
      where: { registration: { eventId: event.id, status: "CONFIRMED" }, isValid: true },
    }),
    prisma.checkIn.count({ where: { eventId: event.id } }),
  ]);

  return <CheckinScanner eventId={event.id} eventName={event.name} initialTotal={total} initialChecked={checked} />;
}
