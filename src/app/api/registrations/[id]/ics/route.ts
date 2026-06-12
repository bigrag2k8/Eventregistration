import { NextResponse } from "next/server";
import { createEvent } from "ics";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const reg = await prisma.registration.findUnique({
    where: { id: params.id },
    include: { event: { include: { location: true } } },
  });
  if (!reg) return new NextResponse("Not found", { status: 404 });

  // Require the registration's access key. Legacy rows without a token are
  // allowed through (ICS leaks only event info, and their email links lack a
  // key) — every new registration gets one and is enforced.
  if (reg.accessToken) {
    const key = new URL(req.url).searchParams.get("key");
    if (key !== reg.accessToken) return new NextResponse("Not found", { status: 404 });
  }

  const { event: e } = reg;
  const start = e.startAt;
  const end = e.endAt;

  const { error, value } = createEvent({
    title: e.name,
    description: e.shortDescription ?? e.description.slice(0, 500),
    location: e.location
      ? `${e.location.addressLine1}, ${e.location.city}`
      : undefined,
    // Components are UTC; tell `ics` so it doesn't treat them as floating local
    // time. The attendee's calendar then converts to their own zone correctly.
    start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
    startInputType: "utc",
    end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()],
    endInputType: "utc",
    url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${e.slug}`,
    organizer: { name: "Your Events App", email: e.contactEmail ?? "noreply@eventflow.app" },
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
