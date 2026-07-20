"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Lock, Users, AlertTriangle, X, CalendarPlus, Clock } from "lucide-react";
import { reserveSessionAction, releaseSessionAction } from "@/app/o/[orgSlug]/events/[slug]/schedule/actions";

export interface AgendaSession {
  id: string;
  title: string;
  track: string | null;
  room: string | null;
  speaker: string | null;
  description: string | null;
  day: number;
  startISO: string;
  endISO: string;
  timeLabel: string; // "9:00 AM – 10:00 AM", precomputed in the event tz
  capacity: number | null;
  seated: number;
}

interface Day { index: number; label: string }

interface Props {
  mode: "plan" | "reserve";
  days: Day[];
  sessions: AgendaSession[];
  eventId: string;
  /** reserve mode */
  orgSlug?: string;
  slug?: string;
  reg?: string;
  regKey?: string;
  dayAccess?: number[]; // covered day indices; [] = all days
  myStatus?: Record<string, "SEAT" | "WAITLIST">;
  /** plan mode */
  registerHref?: string;
  /** reserve mode */
  icsHref?: string | null;
}

type SeatState = "open" | "full" | "reserved" | "waitlisted" | "uncapped";

function seatState(s: AgendaSession, myStatus?: "SEAT" | "WAITLIST"): SeatState {
  if (myStatus === "SEAT") return "reserved";
  if (myStatus === "WAITLIST") return "waitlisted";
  if (s.capacity == null) return "uncapped";
  return s.seated >= s.capacity ? "full" : "open";
}

function overlaps(a: AgendaSession, b: AgendaSession) {
  return new Date(a.startISO) < new Date(b.endISO) && new Date(b.startISO) < new Date(a.endISO);
}

export function ConferenceAgenda({
  mode,
  days,
  sessions,
  eventId,
  orgSlug,
  slug,
  reg,
  regKey,
  dayAccess = [],
  myStatus = {},
  registerHref,
  icsHref,
}: Props) {
  const firstDay = days.find((d) => sessions.some((s) => s.day === d.index))?.index ?? days[0]?.index ?? 1;
  const [activeDay, setActiveDay] = useState(firstDay);
  const [plan, setPlan] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const storageKey = `plan:${eventId}`;

  // Load / persist the personal plan (plan mode only). Start empty so SSR and the
  // first client render match; hydrate from localStorage on mount.
  useEffect(() => {
    if (mode !== "plan") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setPlan(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlan(id: string) {
    setPlan((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const covered = (day: number) => dayAccess.length === 0 || dayAccess.includes(day);
  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  // "My schedule" rail contents.
  const railSessions = useMemo(() => {
    const picked =
      mode === "plan"
        ? sessions.filter((s) => plan.has(s.id))
        : sessions.filter((s) => myStatus[s.id] === "SEAT" || myStatus[s.id] === "WAITLIST");
    return [...picked].sort((a, b) => a.startISO.localeCompare(b.startISO));
  }, [mode, sessions, plan, myStatus]);

  const conflicts = useMemo(() => {
    const out: [string, string][] = [];
    for (let i = 0; i < railSessions.length; i++) {
      for (let j = i + 1; j < railSessions.length; j++) {
        if (overlaps(railSessions[i], railSessions[j])) out.push([railSessions[i].title, railSessions[j].title]);
      }
    }
    return out;
  }, [railSessions]);

  const daySessions = sessions
    .filter((s) => s.day === activeDay)
    .sort((a, b) => a.startISO.localeCompare(b.startISO));

  const open = openId ? byId.get(openId) ?? null : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* Agenda column */}
      <div>
        {days.length > 1 && (
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {days.map((d) => (
              <button
                key={d.index}
                type="button"
                onClick={() => setActiveDay(d.index)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  d.index === activeDay
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Day {d.index} <span className="hidden text-xs font-normal text-slate-400 sm:inline">· {d.label}</span>
              </button>
            ))}
          </div>
        )}

        <ul className="mt-4 space-y-3">
          {daySessions.map((s) => {
            const st = seatState(s, myStatus[s.id]);
            const isCovered = covered(s.day);
            const locked = mode === "reserve" && !isCovered;
            const inPlan = mode === "plan" && plan.has(s.id);
            return (
              <li
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className={`relative cursor-pointer rounded-xl border-l-2 bg-white p-4 pr-12 ring-1 transition hover:ring-brand-200 ${
                  st === "reserved"
                    ? "border-emerald-500 ring-emerald-200"
                    : st === "waitlisted"
                      ? "border-amber-500 ring-amber-200"
                      : locked
                        ? "border-slate-300 ring-slate-200 opacity-70"
                        : inPlan
                          ? "border-brand-500 ring-brand-200"
                          : "border-brand-500 ring-slate-200"
                }`}
              >
                <StarControl
                  mode={mode}
                  session={s}
                  state={st}
                  locked={locked}
                  inPlan={inPlan}
                  onToggle={() => togglePlan(s.id)}
                  reg={reg}
                  regKey={regKey}
                  orgSlug={orgSlug}
                  slug={slug}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-sm tabular-nums text-slate-500">{s.timeLabel}</span>
                </div>
                {(s.track || s.room || s.speaker) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    {s.track && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{s.track}</span>
                    )}
                    {[s.room, s.speaker].filter(Boolean).join(" · ")}
                  </div>
                )}
                <div className="mt-2">
                  <SeatChip session={s} state={st} locked={locked} lockedDay={s.day} />
                </div>
              </li>
            );
          })}
          {daySessions.length === 0 && (
            <li className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No sessions scheduled for this day.</li>
          )}
        </ul>
      </div>

      {/* My Schedule rail */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">My schedule</div>
          <p className="mt-0.5 text-xs text-slate-500">
            {mode === "plan" ? "Sessions you've starred. Register to lock in your seats." : "Your reserved and waitlisted sessions."}
          </p>

          {railSessions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              {mode === "plan" ? "Tap the star on a session to add it here." : "Reserve a session to see it here."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {railSessions.map((s) => {
                const status = myStatus[s.id];
                const tag =
                  mode === "reserve"
                    ? status === "SEAT"
                      ? { text: "Seat reserved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
                      : { text: "Waitlisted", cls: "bg-amber-50 text-amber-700 ring-amber-200" }
                    : s.capacity != null
                      ? { text: "Reserve after registering", cls: "bg-brand-50 text-brand-700 ring-brand-200" }
                      : { text: "Planned", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
                return (
                  <li key={s.id} className="flex gap-2 py-2">
                    <div className="w-14 shrink-0 text-xs tabular-nums text-slate-400">
                      {s.timeLabel.split(" – ")[0]}
                    </div>
                    <div className="min-w-0">
                      <button type="button" onClick={() => setOpenId(s.id)} className="text-left text-sm font-medium leading-snug hover:text-brand-700">
                        {s.title}
                      </button>
                      {s.room && <div className="text-xs text-slate-400">{s.room}</div>}
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tag.cls}`}>
                        {tag.text}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {conflicts.map(([a, b], i) => (
            <div key={i} className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800 ring-1 ring-red-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
              <span><strong>{a}</strong> and <strong>{b}</strong> overlap — you can only be in one room.</span>
            </div>
          ))}

          {mode === "plan" && registerHref && (
            <Link href={registerHref} className="mt-4 block rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
              Register to lock in your seats
            </Link>
          )}
          {mode === "reserve" && icsHref && railSessions.length > 0 && (
            <a href={icsHref} className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              <CalendarPlus className="h-4 w-4" aria-hidden /> Add to calendar
            </a>
          )}
        </div>
      </aside>

      {open && (
        <SessionModal
          session={open}
          state={seatState(open, myStatus[open.id])}
          locked={mode === "reserve" && !covered(open.day)}
          mode={mode}
          inPlan={mode === "plan" && plan.has(open.id)}
          onClose={() => setOpenId(null)}
          onToggle={() => togglePlan(open.id)}
          reg={reg}
          regKey={regKey}
          orgSlug={orgSlug}
          slug={slug}
        />
      )}
    </div>
  );
}

/** Live seat availability chip shown on each card. */
function SeatChip({ session, state, locked, lockedDay }: { session: AgendaSession; state: SeatState; locked: boolean; lockedDay: number }) {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Needs a Day {lockedDay} pass
      </span>
    );
  }
  if (session.capacity == null) {
    return <span className="text-xs text-slate-400">Open seating</span>;
  }
  const left = Math.max(0, session.capacity - session.seated);
  const filling = left > 0 && left / session.capacity <= 0.25;
  const cls =
    state === "reserved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : left <= 0
        ? "bg-slate-100 text-slate-500 ring-slate-200"
        : filling
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      <Users className="h-3.5 w-3.5" aria-hidden />
      {state === "reserved" ? "Your seat" : left <= 0 ? "Full" : `${session.seated}/${session.capacity} · ${left} left`}
    </span>
  );
}

/** The top-right star / reserve control on a card. Stops click bubbling so it
 *  doesn't also open the modal. In reserve mode it submits the proven server
 *  actions; in plan mode it toggles the local plan. */
function StarControl({
  mode,
  session,
  state,
  locked,
  inPlan,
  onToggle,
  reg,
  regKey,
  orgSlug,
  slug,
}: {
  mode: "plan" | "reserve";
  session: AgendaSession;
  state: SeatState;
  locked: boolean;
  inPlan: boolean;
  onToggle: () => void;
  reg?: string;
  regKey?: string;
  orgSlug?: string;
  slug?: string;
}) {
  if (locked) {
    return (
      <span className="absolute right-3 top-3 text-slate-300" aria-hidden>
        <Lock className="h-4 w-4" />
      </span>
    );
  }

  if (mode === "plan") {
    // Uncapped: pure bookmark. Capacity: still bookmarkable as intent (reserve later).
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={inPlan ? "Remove from my schedule" : "Add to my schedule"}
        className={`absolute right-2.5 top-2.5 rounded-md p-1.5 ${inPlan ? "text-amber-500" : "text-slate-300 hover:text-slate-500"}`}
      >
        <Star className="h-5 w-5" fill={inPlan ? "currentColor" : "none"} />
      </button>
    );
  }

  // reserve mode — uncapped needs no reservation.
  if (session.capacity == null) return null;

  const hidden = (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reg" value={reg} />
      <input type="hidden" name="key" value={regKey} />
      <input type="hidden" name="sessionId" value={session.id} />
    </>
  );
  const action = state === "reserved" || state === "waitlisted" ? releaseSessionAction : reserveSessionAction;
  const cls =
    state === "reserved"
      ? "text-emerald-600"
      : state === "waitlisted"
        ? "text-amber-600"
        : "text-slate-300 hover:text-slate-500";
  return (
    <form action={action} className="absolute right-2.5 top-2.5" onClick={(e) => e.stopPropagation()}>
      {hidden}
      <button
        type="submit"
        aria-label={
          state === "reserved" ? "Release your seat" : state === "waitlisted" ? "Leave the waitlist" : state === "full" ? "Join the waitlist" : "Reserve a seat"
        }
        className={`rounded-md p-1.5 ${cls}`}
      >
        <Star className="h-5 w-5" fill={state === "reserved" || state === "waitlisted" ? "currentColor" : "none"} />
      </button>
    </form>
  );
}

/** Session detail modal (title, speaker, time, description, capacity, CTA). */
function SessionModal({
  session,
  state,
  locked,
  mode,
  inPlan,
  onClose,
  onToggle,
  reg,
  regKey,
  orgSlug,
  slug,
}: {
  session: AgendaSession;
  state: SeatState;
  locked: boolean;
  mode: "plan" | "reserve";
  inPlan: boolean;
  onClose: () => void;
  onToggle: () => void;
  reg?: string;
  regKey?: string;
  orgSlug?: string;
  slug?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = session.capacity != null ? Math.max(0, session.capacity - session.seated) : null;
  const pct = session.capacity ? Math.min(100, Math.round((session.seated / session.capacity) * 100)) : 0;

  const hidden = (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reg" value={reg} />
      <input type="hidden" name="key" value={regKey} />
      <input type="hidden" name="sessionId" value={session.id} />
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200">
          <X className="h-4 w-4" />
        </button>
        {session.track && <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">{session.track}</div>}
        <h3 className="mt-1 pr-8 text-lg font-bold leading-snug">{session.title}</h3>
        {session.speaker && <div className="mt-2 text-sm font-medium text-slate-700">{session.speaker}</div>}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-100">
          <Clock className="h-4 w-4 flex-none text-slate-400" aria-hidden />
          {session.timeLabel}
          {session.room ? ` · ${session.room}` : ""}
        </div>
        {session.description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{session.description}</p>}

        {session.capacity != null && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600">Seats</span>
              <span className="font-semibold">
                {left! <= 0 ? "Full" : `${left} of ${session.capacity} left`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${left! <= 0 ? "bg-slate-400" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-5">
          {locked ? (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-dashed ring-slate-300">
              <Lock className="h-4 w-4 flex-none" aria-hidden /> This session is on a day your pass doesn&rsquo;t include.
            </div>
          ) : mode === "plan" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onToggle();
                  onClose();
                }}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  inPlan ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {inPlan ? "✓ In my schedule — remove" : "Add to my schedule"}
              </button>
              {session.capacity != null && (
                <p className="mt-2 text-center text-xs text-slate-500">Reserve your seat after you register.</p>
              )}
            </>
          ) : session.capacity == null ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
              Open seating — included with your pass, just come.
            </div>
          ) : (
            <form action={state === "reserved" || state === "waitlisted" ? releaseSessionAction : reserveSessionAction}>
              {hidden}
              <button
                type="submit"
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  state === "reserved"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : state === "waitlisted"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : state === "full"
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {state === "reserved"
                  ? "Reserved ✓ — release"
                  : state === "waitlisted"
                    ? "Waitlisted — leave"
                    : state === "full"
                      ? "Join the waitlist"
                      : "Reserve a seat"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
