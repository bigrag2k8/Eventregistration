import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getRegistrationByAccessToken } from "@/lib/registration-access";
import { conferenceDays, dayIndexOf, dayAccessLabel } from "@/lib/conference";
import { ConferenceAgenda, type AgendaSession } from "@/components/ConferenceAgenda";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  day_locked: "That session is on a day your pass doesn't include. Add that day from the event page to attend it.",
  not_confirmed: "Your registration isn't confirmed yet, so seats can't be reserved.",
  uncapped: "That session has open seating — no reservation needed, just come.",
  wrong_event: "That session couldn't be found for this event.",
};

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; slug: string };
  searchParams: { reg?: string; key?: string; error?: string };
}) {
  const registration = await getRegistrationByAccessToken(searchParams.reg, searchParams.key, {
    ticketType: true,
    event: {
      include: {
        organization: true,
        sessions: { orderBy: [{ startAt: "asc" }, { sortOrder: "asc" }] },
      },
    },
    sessionReservations: true,
  });
  if (!registration) return notFound();

  const event = registration.event;
  if (event.organization.slug !== params.orgSlug || event.slug !== params.slug) return notFound();

  const days = conferenceDays(event);
  const dayAccess = registration.ticketType.dayAccess;

  // Live seat counts for the capacity-limited sessions.
  const capSessionIds = event.sessions.filter((s) => s.capacity != null).map((s) => s.id);
  const counts = capSessionIds.length
    ? await prisma.sessionReservation.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: capSessionIds }, status: "SEAT" },
        _count: { _all: true },
      })
    : [];
  const seatedBySession = new Map(counts.map((c) => [c.sessionId, c._count._all]));

  const myStatus: Record<string, "SEAT" | "WAITLIST"> = {};
  for (const r of registration.sessionReservations) myStatus[r.sessionId] = r.status as "SEAT" | "WAITLIST";
  const seatCount = registration.sessionReservations.filter((r) => r.status === "SEAT").length;
  const waitCount = registration.sessionReservations.filter((r) => r.status === "WAITLIST").length;

  const agendaSessions: AgendaSession[] = event.sessions.map((s) => ({
    id: s.id,
    title: s.title,
    track: s.track,
    room: s.room,
    speaker: s.speaker,
    description: s.description,
    day: dayIndexOf(s.startAt, event),
    startISO: s.startAt.toISOString(),
    endISO: s.endAt.toISOString(),
    timeLabel: `${formatInTimeZone(s.startAt, event.timezone, "h:mm a")} – ${formatInTimeZone(s.endAt, event.timezone, "h:mm a")}`,
    capacity: s.capacity,
    seated: seatedBySession.get(s.id) ?? 0,
  }));

  const icsHref = `/api/registrations/${registration.id}/ics?key=${encodeURIComponent(searchParams.key ?? "")}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-1 text-sm text-slate-500">
        <Link href={`/o/${params.orgSlug}/events/${params.slug}`} className="text-brand-700 hover:underline">
          ◀ {event.name}
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Build your schedule</h1>
      <p className="mt-1 text-sm text-slate-600">
        Reserve your spot in limited-capacity sessions. Your pass: <strong>{registration.ticketType.name}</strong>
        {days.length > 1 && dayAccessLabel(dayAccess, days) ? ` · ${dayAccessLabel(dayAccess, days)}` : ""}.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {seatCount} reserved{waitCount ? ` · ${waitCount} waitlisted` : ""}
      </p>

      {searchParams.error && ERRORS[searchParams.error] && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          {ERRORS[searchParams.error]}
        </div>
      )}

      {event.sessions.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">This event doesn&rsquo;t have an agenda yet.</p>
      ) : (
        <div className="mt-6">
          <ConferenceAgenda
            mode="reserve"
            days={days}
            sessions={agendaSessions}
            eventId={event.id}
            orgSlug={params.orgSlug}
            slug={params.slug}
            reg={searchParams.reg}
            regKey={searchParams.key}
            dayAccess={dayAccess}
            myStatus={myStatus}
            icsHref={icsHref}
          />
        </div>
      )}
    </main>
  );
}
