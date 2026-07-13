import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * PURE recurrence math for event series — no DB, no wall-clock — so it can be
 * unit-tested exhaustively. Turns a recurrence rule into the UTC start instants
 * of each occurrence up to a horizon.
 *
 * Calendar math runs on timezone-agnostic "local dates" ({y, m, d}); the real
 * instant for each occurrence is produced once via date-fns-tz `fromZonedTime`
 * so DST shifts are handled correctly (6pm local stays 6pm local across a
 * spring-forward / fall-back boundary).
 */

export type SeriesFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type MonthlyMode = "DAY_OF_MONTH" | "NTH_WEEKDAY";

export interface OccurrenceRule {
  frequency: SeriesFrequency;
  interval: number; // every N days/weeks/months (>=1)
  byWeekday: number[]; // WEEKLY only, 0=Sun..6=Sat
  monthlyMode: MonthlyMode | null; // MONTHLY only
  timezone: string;
  startDate: string; // 'yyyy-MM-dd' — first occurrence's local date
  startTimeMinutes: number; // minutes from local midnight
  endDate: string | null; // 'yyyy-MM-dd' inclusive last date, or null (open-ended)
  occurrenceCap: number | null; // hard cap on total occurrences, or null
}

export interface Occurrence {
  index: number; // 1-based position in the series
  start: Date; // UTC instant
}

// Backstops against a rule/horizon bug spinning forever — far above any real
// horizon window (90 days of a daily series = ~90 occurrences).
const MAX_OCCURRENCES = 400;
const MAX_ITERATIONS = 5000;

interface LD { y: number; m: number; d: number } // local date, m is 0-based

function parseLD(s: string): LD {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
function ldToUTC(ld: LD): Date {
  return new Date(Date.UTC(ld.y, ld.m, ld.d));
}
function utcToLD(dt: Date): LD {
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}
function addDays(ld: LD, n: number): LD {
  const dt = ldToUTC(ld);
  dt.setUTCDate(dt.getUTCDate() + n);
  return utcToLD(dt);
}
function weekdayOf(ld: LD): number {
  return ldToUTC(ld).getUTCDay(); // 0=Sun..6=Sat
}
function cmpLD(a: LD, b: LD): number {
  return ldToUTC(a).getTime() - ldToUTC(b).getTime();
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
/** Date of the nth (1-based) `weekday` in month (y, m), or null if it doesn't exist. */
function nthWeekdayOfMonth(y: number, m: number, weekday: number, nth: number): LD | null {
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  if (day > daysInMonth(y, m)) return null;
  return { y, m, d: day };
}

/**
 * Yields candidate local dates in chronological order per the rule, forever
 * (the consumer stops it). Skips calendar-impossible dates (the 31st in a
 * 30-day month, or a 5th Friday that doesn't exist).
 */
function* candidateDates(rule: OccurrenceRule): Generator<LD> {
  const start = parseLD(rule.startDate);
  const interval = Math.max(1, rule.interval);
  let iters = 0;

  if (rule.frequency === "DAILY") {
    let cur = start;
    while (iters++ < MAX_ITERATIONS) {
      yield cur;
      cur = addDays(cur, interval);
    }
    return;
  }

  if (rule.frequency === "WEEKLY") {
    const days = (rule.byWeekday.length ? rule.byWeekday : [weekdayOf(start)])
      .slice()
      .sort((a, b) => a - b);
    const anchor = addDays(start, -weekdayOf(start)); // Sunday of the start week
    for (let block = 0; iters++ < MAX_ITERATIONS; block++) {
      const weekStart = addDays(anchor, block * 7 * interval);
      for (const wd of days) {
        const cand = addDays(weekStart, wd);
        if (cmpLD(cand, start) >= 0) yield cand; // skip days before the start in week 0
      }
    }
    return;
  }

  // MONTHLY
  const mode: MonthlyMode = rule.monthlyMode ?? "DAY_OF_MONTH";
  const dom = start.d;
  const wd = weekdayOf(start);
  const nth = Math.floor((start.d - 1) / 7) + 1; // which weekday-of-month the start is
  for (let k = 0; iters++ < MAX_ITERATIONS; k++) {
    const base = new Date(Date.UTC(start.y, start.m + k * interval, 1));
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    let cand: LD | null = null;
    if (mode === "DAY_OF_MONTH") {
      if (daysInMonth(y, m) >= dom) cand = { y, m, d: dom };
    } else {
      cand = nthWeekdayOfMonth(y, m, wd, nth);
    }
    if (cand) yield cand;
  }
}

/**
 * Occurrences whose start instant is at or before `throughInstant`, respecting
 * the series end date and occurrence cap. Deterministic for a given input.
 */
export function computeOccurrences(rule: OccurrenceRule, throughInstant: Date): Occurrence[] {
  const hh = String(Math.floor(rule.startTimeMinutes / 60)).padStart(2, "0");
  const mm = String(rule.startTimeMinutes % 60).padStart(2, "0");
  const end = rule.endDate ? parseLD(rule.endDate) : null;

  const out: Occurrence[] = [];
  let index = 0;
  for (const ld of candidateDates(rule)) {
    if (end && cmpLD(ld, end) > 0) break; // past the series end date
    index += 1;
    if (rule.occurrenceCap != null && index > rule.occurrenceCap) break;
    const dateStr = `${ld.y}-${String(ld.m + 1).padStart(2, "0")}-${String(ld.d).padStart(2, "0")}`;
    const start = fromZonedTime(`${dateStr} ${hh}:${mm}:00`, rule.timezone);
    if (start.getTime() > throughInstant.getTime()) break; // past the horizon
    out.push({ index, start });
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

/** Build the OccurrenceRule for a stored series (derives local dates in its tz). */
export function ruleForSeries(s: {
  frequency: SeriesFrequency; interval: number; byWeekday: number[];
  monthlyMode: MonthlyMode | null; timezone: string; seriesStart: Date;
  startTimeMinutes: number; seriesEnd: Date | null; occurrenceCap: number | null;
}): OccurrenceRule {
  return {
    frequency: s.frequency,
    interval: s.interval,
    byWeekday: s.byWeekday,
    monthlyMode: s.monthlyMode,
    timezone: s.timezone,
    startDate: formatInTimeZone(s.seriesStart, s.timezone, "yyyy-MM-dd"),
    startTimeMinutes: s.startTimeMinutes,
    endDate: s.seriesEnd ? formatInTimeZone(s.seriesEnd, s.timezone, "yyyy-MM-dd") : null,
    occurrenceCap: s.occurrenceCap,
  };
}

export function occurrenceSlug(seriesSlug: string, start: Date, tz: string): string {
  return `${seriesSlug}-${formatInTimeZone(start, tz, "yyyy-MM-dd")}`;
}

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human one-line summary of a recurrence rule, e.g. "Weekly on Mon, Wed · 6:00 PM". */
export function describeRecurrence(s: {
  frequency: SeriesFrequency; interval: number; byWeekday: number[]; startTimeMinutes: number;
}): string {
  const n = Math.max(1, s.interval);
  let base: string;
  if (s.frequency === "DAILY") base = n === 1 ? "Every day" : `Every ${n} days`;
  else if (s.frequency === "WEEKLY") {
    const days = s.byWeekday.slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]).join(", ");
    const every = n === 1 ? "Weekly" : `Every ${n} weeks`;
    base = days ? `${every} on ${days}` : every;
  } else base = n === 1 ? "Monthly" : `Every ${n} months`;

  const h = Math.floor(s.startTimeMinutes / 60);
  const m = s.startTimeMinutes % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  return `${base} · ${time}`;
}
