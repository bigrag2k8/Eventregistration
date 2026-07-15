import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { computeOccurrences, type OccurrenceRule } from "@/server/recurring-rule";

const NY = "America/New_York";

// Format each occurrence back to its LOCAL wall-clock, so assertions read as the
// dates/times an organizer actually intends (independent of UTC offset / DST).
function local(occ: { start: Date }[], tz = NY): string[] {
  return occ.map((o) => formatInTimeZone(o.start, tz, "yyyy-MM-dd HH:mm"));
}

const base: Omit<OccurrenceRule, "frequency"> = {
  interval: 1,
  byWeekday: [],
  monthlyMode: null,
  timezone: NY,
  startDate: "2026-06-01",
  startTimeMinutes: 18 * 60, // 18:00
  endDate: null,
  occurrenceCap: null,
};

// A generous horizon for most cases.
const H = new Date("2027-01-01T00:00:00Z");

describe("computeOccurrences — DAILY", () => {
  it("every day from the start at the set local time", () => {
    const occ = computeOccurrences({ ...base, frequency: "DAILY" }, new Date("2026-06-05T23:00:00Z"));
    expect(local(occ)).toEqual([
      "2026-06-01 18:00", "2026-06-02 18:00", "2026-06-03 18:00", "2026-06-04 18:00", "2026-06-05 18:00",
    ]);
    expect(occ.map((o) => o.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it("interval 2 = every other day", () => {
    const occ = computeOccurrences({ ...base, frequency: "DAILY", interval: 2 }, new Date("2026-06-07T23:00:00Z"));
    expect(local(occ)).toEqual(["2026-06-01 18:00", "2026-06-03 18:00", "2026-06-05 18:00", "2026-06-07 18:00"]);
  });
});

describe("computeOccurrences — WEEKLY", () => {
  it("Mon + Wed weekly (start is a Monday)", () => {
    // 2026-06-01 is a Monday.
    const occ = computeOccurrences(
      { ...base, frequency: "WEEKLY", byWeekday: [1, 3] },
      new Date("2026-06-15T23:00:00Z"),
    );
    expect(local(occ)).toEqual([
      "2026-06-01 18:00", // Mon
      "2026-06-03 18:00", // Wed
      "2026-06-08 18:00", // Mon
      "2026-06-10 18:00", // Wed
      "2026-06-15 18:00", // Mon
    ]);
  });

  it("skips selected days that fall before the start date in week 0", () => {
    // Start Wed 2026-06-03; Mon+Wed selected — the Mon (06-01) is before start, so week 0 yields only Wed.
    const occ = computeOccurrences(
      { ...base, frequency: "WEEKLY", byWeekday: [1, 3], startDate: "2026-06-03" },
      new Date("2026-06-10T23:00:00Z"),
    );
    expect(local(occ)).toEqual(["2026-06-03 18:00", "2026-06-08 18:00", "2026-06-10 18:00"]);
  });

  it("interval 2 = every other week", () => {
    const occ = computeOccurrences(
      { ...base, frequency: "WEEKLY", byWeekday: [1], interval: 2 },
      new Date("2026-07-01T23:00:00Z"),
    );
    expect(local(occ)).toEqual(["2026-06-01 18:00", "2026-06-15 18:00", "2026-06-29 18:00"]);
  });
});

describe("computeOccurrences — MONTHLY", () => {
  it("same day-of-month each month", () => {
    const occ = computeOccurrences(
      { ...base, frequency: "MONTHLY", monthlyMode: "DAY_OF_MONTH", startDate: "2026-06-15" },
      new Date("2026-09-30T23:00:00Z"),
    );
    expect(local(occ)).toEqual([
      "2026-06-15 18:00", "2026-07-15 18:00", "2026-08-15 18:00", "2026-09-15 18:00",
    ]);
  });

  it("skips months without the target day (31st)", () => {
    const occ = computeOccurrences(
      { ...base, frequency: "MONTHLY", monthlyMode: "DAY_OF_MONTH", startDate: "2026-01-31" },
      new Date("2026-05-01T23:00:00Z"),
    );
    // Jan 31 ok, Feb has no 31 (skip), Mar 31 ok, Apr has no 31 (skip).
    expect(local(occ)).toEqual(["2026-01-31 18:00", "2026-03-31 18:00"]);
  });

  it("nth-weekday: 2nd Tuesday each month", () => {
    // 2026-06-09 is the 2nd Tuesday of June 2026.
    const occ = computeOccurrences(
      { ...base, frequency: "MONTHLY", monthlyMode: "NTH_WEEKDAY", startDate: "2026-06-09" },
      new Date("2026-08-31T23:00:00Z"),
    );
    expect(local(occ)).toEqual([
      "2026-06-09 18:00", // 2nd Tue Jun
      "2026-07-14 18:00", // 2nd Tue Jul
      "2026-08-11 18:00", // 2nd Tue Aug
    ]);
  });
});

describe("computeOccurrences — bounds", () => {
  it("respects occurrenceCap", () => {
    const occ = computeOccurrences({ ...base, frequency: "DAILY", occurrenceCap: 3 }, H);
    expect(occ).toHaveLength(3);
    expect(local(occ)).toEqual(["2026-06-01 18:00", "2026-06-02 18:00", "2026-06-03 18:00"]);
  });

  it("respects endDate (inclusive)", () => {
    const occ = computeOccurrences({ ...base, frequency: "DAILY", endDate: "2026-06-03" }, H);
    expect(local(occ)).toEqual(["2026-06-01 18:00", "2026-06-02 18:00", "2026-06-03 18:00"]);
  });

  it("stops at the horizon", () => {
    const occ = computeOccurrences({ ...base, frequency: "DAILY" }, new Date("2026-06-03T18:00:00Z"));
    // Horizon is 2026-06-03 18:00 UTC = 14:00 local; only Jun 1 & 2 at 18:00 local are before it.
    expect(local(occ)).toEqual(["2026-06-01 18:00", "2026-06-02 18:00"]);
  });
});

describe("computeOccurrences — DST correctness", () => {
  it("keeps 18:00 local across US spring-forward (Mar 8 2026)", () => {
    const occ = computeOccurrences(
      { ...base, frequency: "WEEKLY", byWeekday: [0], startDate: "2026-03-01" }, // Sundays
      new Date("2026-03-16T23:00:00Z"),
    );
    // Local time stays 18:00 every week even though the UTC offset changes.
    expect(local(occ)).toEqual(["2026-03-01 18:00", "2026-03-08 18:00", "2026-03-15 18:00"]);
    // ...and the underlying UTC instants shift by an hour across the boundary:
    // Mar 1 (EST, UTC-5) → 23:00Z; Mar 8 & 15 (EDT, UTC-4) → 22:00Z.
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-03-01T23:00:00.000Z",
      "2026-03-08T22:00:00.000Z",
      "2026-03-15T22:00:00.000Z",
    ]);
  });
});
