import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getRegistrationByAccessToken } from "@/lib/registration-access";
import {
  conferenceDays,
  dayIndexOf,
  ticketCoversDay,
  sessionsOverlap,
  sessionSeatState,
  dayAccessLabel,
} from "@/lib/conference";
import { reserveSessionAction, releaseSessionAction } from "./actions";
import { CalendarClock, Lock, Users, AlertTriangle } from "lucide-react";

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
  const myStatusBySession = new Map(
    registration.sessionReservations.map((r) => [r.sessionId, r.status as "SEAT" | "WAITLIST"]),
  );

  // Soft conflict detection among the attendee's held SEATs.
  const mySeats = event.sessions.filter((s) => myStatusBySession.get(s.id) === "SEAT");
  const conflicts: [string, string][] = [];
  for (let i = 0; i < mySeats.length; i++) {
    for (let j = i + 1; j < mySeats.length; j++) {
      if (sessionsOverlap(mySeats[i], mySeats[j])) conflicts.push([mySeats[i].title, mySeats[j].title]);
    }
  }

  const seatCount = mySeats.length;
  const waitCount = registration.sessionReservations.filter((r) => r.status === "WAITLIST").length;

  const hidden = (sessionId: string) => (
    <>
      <input type="hidden" name="orgSlug" value={params.orgSlug} />
      <input type="hidden" name="slug" value={params.slug} />
      <input type="hidden" name="reg" value={searchParams.reg} />
      <input type="hidden" name="key" value={searchParams.key} />
      <input type="hidden" name="sessionId" value={sessionId} />
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-1 text-sm text-slate-500">
        <Link href={`/o/${params.orgSlug}/events/${params.slug}`} className="text-brand-700 hover:underline">
          ◀ {event.name}
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Build your schedule</h1>
      <p className="mt-1 text-sm text-slate-600">
        Reserve your spot in limited-capacity sessions. Your pass:{" "}
        <strong>{registration.ticketType.name}</strong>
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

      {conflicts.map(([a, b], i) => (
        <div key={i} className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>
            Heads up — <strong>{a}</strong> and <strong>{b}</strong> overlap in time. You can only be in one room; drop one when you decide.
          </span>
        </div>
      ))}

      {event.sessions.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">This event doesn&rsquo;t have an agenda yet.</p>
      )}

      <div className="mt-6 space-y-8">
        {days.map((day) => {
          const daySessions = event.sessions.filter((s) => dayIndexOf(s.startAt, event) === day.index);
          if (daySessions.length === 0) return null;
          const covered = ticketCoversDay(dayAccess, day.index);
          return (
            <div key={day.index}>
              {days.length > 1 && (
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
                  Day {day.index} · {day.label}
                  {!covered && <span className="ml-1 text-xs font-normal text-slate-400">(not in your pass)</span>}
                </h2>
              )}
              <ul className={`${days.length > 1 ? "mt-3" : ""} space-y-3`}>
                {daySessions.map((s) => {
                  const capped = s.capacity != null;
                  const seated = seatedBySession.get(s.id) ?? 0;
                  const myStatus = myStatusBySession.get(s.id) ?? null;
                  const state = sessionSeatState({ capacity: s.capacity, seated, myStatus });
                  const timeStr = `${formatInTimeZone(s.startAt, event.timezone, "h:mm a")} – ${formatInTimeZone(s.endAt, event.timezone, "h:mm a")}`;
                  const meta = [s.track, s.room, s.speaker].filter(Boolean).join(" · ");

                  return (
                    <li
                      key={s.id}
                      className={`rounded-xl p-4 ring-1 ${
                        state === "reserved" ? "ring-emerald-300 bg-emerald-50/40" : state === "waitlisted" ? "ring-amber-300 bg-amber-50/40" : "ring-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="font-medium">{s.title}</span>
                        <span className="text-sm tabular-nums text-slate-500">{timeStr}</span>
                      </div>
                      {meta && <div className="mt-1 text-sm text-slate-500">{meta}</div>}
                      {s.description && <p className="mt-2 text-sm text-slate-600">{s.description}</p>}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {!capped ? (
                          covered ? (
                            <span className="text-xs text-slate-500">Open seating — included with your pass, just come.</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Lock className="h-3.5 w-3.5" aria-hidden /> Not included in your pass
                            </span>
                          )
                        ) : !covered ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Lock className="h-3.5 w-3.5" aria-hidden /> Requires a Day {day.index} pass —{" "}
                            <Link href={`/o/${params.orgSlug}/events/${params.slug}`} className="text-brand-700 hover:underline">
                              add it
                            </Link>
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Users className="h-3.5 w-3.5" aria-hidden />
                              {seated}/{s.capacity} seats{state === "full" ? " · full" : ""}
                            </span>
                            {state === "reserved" ? (
                              <form action={releaseSessionAction}>
                                {hidden(s.id)}
                                <button className="btn-secondary text-emerald-700" type="submit">Reserved ✓ — release</button>
                              </form>
                            ) : state === "waitlisted" ? (
                              <form action={releaseSessionAction}>
                                {hidden(s.id)}
                                <button className="btn-secondary text-amber-700" type="submit">Waitlisted — leave</button>
                              </form>
                            ) : state === "full" ? (
                              <form action={reserveSessionAction}>
                                {hidden(s.id)}
                                <button className="btn-secondary" type="submit">Join waitlist</button>
                              </form>
                            ) : (
                              <form action={reserveSessionAction}>
                                {hidden(s.id)}
                                <button className="btn-primary" type="submit">Reserve seat</button>
                              </form>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </main>
  );
}
