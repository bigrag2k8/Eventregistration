import { NextResponse } from "next/server";
import { createEvent } from "ics";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const reg = await prisma.registration.findUnique({
    where: { id: params.id },
    include: { event: { include: { location: true } } },
  });
  if (!reg) return new NextResponse("Not found", { status: 404 });

  const { event: e } = reg;
  const start = e.startAt;
  const end = e.endAt;

  const { error, value } = createEvent({
    title: e.name,
    description: e.shortDescription ?? e.description.slice(0, 500),
    location: e.location
      ? `${e.location.addressLine1}, ${e.location.city}`
      : undefined,
    start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
    end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()],
    url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${e.slug}`,
    organizer: { name: "EventFlow", email: e.contactEmail ?? "noreply@eventflow.app" },
    status: "CONFIRMED",
  });
  if (error || !value) return new NextResponse("ICS error", { status: 500 });

  return new NextResponse(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
    },
  });
}
