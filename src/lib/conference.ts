import { formatInTimeZone } from "date-fns-tz";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/**
 * Conference day math. A multi-day event (a conference) is divided into calendar
 * days IN THE EVENT'S OWN TIMEZONE — "Day 2" is a local-calendar-day concept, not
 * a UTC one. A session at 04:00 UTC is late-night Day 1 in Los Angeles but Day 2
 * in London; only tz-aware bucketing gets that right. Days are always DERIVED
 * from the event's start/end (and a session's start), never stored, so they stay
 * correct after a reschedule moves the dates. See EventSession in schema.prisma.
 */

export interface EventSpan {
  startAt: Date;
  endAt: Date;
  timezone: string;
}

export interface ConferenceDay {
  /** 1-based day number within the conference. */
  index: number;
  /** Local calendar date (date-only; used for labels/arithmetic, never as an instant). */
  date: Date;
  /** Human label, e.g. "Fri, Aug 15". */
  label: string;
}

/** The local-calendar date key ("yyyy-MM-dd") of an instant in the event's tz. */
function localDateKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/** How many calendar days the event spans in its own timezone (min 1). */
export function conferenceDayCount(ev: EventSpan): number {
  const start = parseISO(localDateKey(ev.startAt, ev.timezone));
  const end = parseISO(localDateKey(ev.endAt, ev.timezone));
  return Math.max(1, differenceInCalendarDays(end, start) + 1);
}

/** 1-based conference day an instant falls on (in the event's tz). */
export function dayIndexOf(instant: Date, ev: EventSpan): number {
  const start = parseISO(localDateKey(ev.startAt, ev.timezone));
  const day = parseISO(localDateKey(instant, ev.timezone));
  return differenceInCalendarDays(day, start) + 1;
}

/** Every conference day, 1-indexed, with a display label. */
export function conferenceDays(ev: EventSpan): ConferenceDay[] {
  const start = parseISO(localDateKey(ev.startAt, ev.timezone));
  const n = conferenceDayCount(ev);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(start, i);
    return { index: i + 1, date, label: format(date, "EEE, MMM d") };
  });
}

/**
 * Does a ticket's dayAccess cover the given 1-based day? An EMPTY dayAccess means
 * "the whole event / all days" — so every existing ticket and every single-day
 * event is covered by default.
 */
export function ticketCoversDay(dayAccess: number[], dayIndex: number): boolean {
  return dayAccess.length === 0 || dayAccess.includes(dayIndex);
}

/**
 * Short label for a ticket tier's day scope, e.g. "" (single-day event),
 * "All days", "Day 2", or "Day 1, 3". Empty dayAccess on a multi-day event reads
 * as "All days"; on a single-day event there's nothing to say, so returns "".
 */
export function dayAccessLabel(dayAccess: number[], days: ConferenceDay[]): string {
  if (days.length <= 1) return "";
  if (dayAccess.length === 0) return "All days";
  const inRange = dayAccess.filter((d) => d >= 1 && d <= days.length).sort((a, b) => a - b);
  if (inRange.length === 0) return "All days";
  if (inRange.length === days.length) return "All days";
  return "Day " + inRange.join(", ");
}

/**
 * The effective set of conference days a registration grants access to. A
 * multi-pass order (buying several day passes at once) stores one
 * RegistrationItem per pass; the access is the UNION of every item's ticket
 * dayAccess. An empty array anywhere means "the whole event / all days", which
 * dominates the union (returned as []). Ordinary single-ticket registrations
 * have no items and fall back to their ticketType's dayAccess. The return value
 * is fed straight into `ticketCoversDay` and `dayAccessLabel`.
 */
export function registrationDayAccess(reg: {
  ticketType: { dayAccess: number[] };
  items?: { ticketType: { dayAccess: number[] } }[] | null;
}): number[] {
  const sources = reg.items && reg.items.length
    ? reg.items.map((i) => i.ticketType.dayAccess)
    : [reg.ticketType.dayAccess];
  // Any "all days" pass (empty dayAccess) covers the whole event.
  if (sources.some((d) => d.length === 0)) return [];
  const set = new Set<number>();
  for (const d of sources) for (const n of d) set.add(n);
  return [...set].sort((a, b) => a - b);
}

/** Do two time ranges overlap? Touching (a.end === b.start) does NOT count. */
export function sessionsOverlap(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date },
): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export type SeatState = "open" | "full" | "reserved" | "waitlisted";

/**
 * The display/button state for a capacity session on an attendee's schedule.
 * `myStatus` is their own SessionReservation status (or null if none). Seats are
 * counted live (`seated`), so `open` vs `full` reflects real-time availability.
 */
export function sessionSeatState(opts: {
  capacity: number | null;
  seated: number;
  myStatus: "SEAT" | "WAITLIST" | null;
}): SeatState {
  if (opts.myStatus === "SEAT") return "reserved";
  if (opts.myStatus === "WAITLIST") return "waitlisted";
  if (opts.capacity == null) return "open"; // uncapped — reservation N/A
  return opts.seated >= opts.capacity ? "full" : "open";
}
