import { describe, it, expect } from "vitest";
import {
  conferenceDayCount,
  dayIndexOf,
  conferenceDays,
  ticketCoversDay,
  dayAccessLabel,
  sessionsOverlap,
  sessionSeatState,
} from "@/lib/conference";
import { eventEntitlements, FREE_EVENT_MAX_DAYS, PREMIUM_EVENT_MAX_DAYS } from "@/lib/plans";

describe("conferenceDayCount", () => {
  it("counts the seeded single LA day (16:00Z → next-day 01:00Z = same local day)", () => {
    // 2026-08-15 16:00Z = 09:00 PDT; 2026-08-16 01:00Z = 18:00 PDT → both Aug 15 in LA.
    const ev = {
      startAt: new Date("2026-08-15T16:00:00.000Z"),
      endAt: new Date("2026-08-16T01:00:00.000Z"),
      timezone: "America/Los_Angeles",
    };
    expect(conferenceDayCount(ev)).toBe(1);
  });

  it("counts a 3-day span", () => {
    const ev = {
      startAt: new Date("2026-08-15T16:00:00.000Z"), // Aug 15 PDT
      endAt: new Date("2026-08-17T23:00:00.000Z"), // Aug 17 PDT
      timezone: "America/Los_Angeles",
    };
    expect(conferenceDayCount(ev)).toBe(3);
  });

  it("is timezone-sensitive: the same instants span 2 days in London", () => {
    const ev = {
      startAt: new Date("2026-08-15T16:00:00.000Z"),
      endAt: new Date("2026-08-16T01:00:00.000Z"), // 02:00 BST → Aug 16 in London
      timezone: "Europe/London",
    };
    expect(conferenceDayCount(ev)).toBe(2);
  });
});

describe("dayIndexOf", () => {
  const ev = {
    startAt: new Date("2026-08-15T16:00:00.000Z"),
    endAt: new Date("2026-08-18T23:00:00.000Z"),
    timezone: "America/Los_Angeles",
  };

  it("puts a late-night session on the correct local day", () => {
    // 2026-08-16 04:00Z = 21:00 PDT Aug 15 → Day 1 in LA.
    expect(dayIndexOf(new Date("2026-08-16T04:00:00.000Z"), ev)).toBe(1);
  });

  it("same instant lands on Day 2 for a London event (tz-correctness)", () => {
    const londonEv = { ...ev, timezone: "Europe/London" };
    // 2026-08-16 04:00Z = 05:00 BST Aug 16 → Day 2 in London.
    expect(dayIndexOf(new Date("2026-08-16T04:00:00.000Z"), londonEv)).toBe(2);
  });

  it("a mid-conference morning is Day 2", () => {
    expect(dayIndexOf(new Date("2026-08-16T17:00:00.000Z"), ev)).toBe(2); // 10:00 PDT Aug 16
  });
});

describe("conferenceDays", () => {
  it("returns 1-indexed days with labels", () => {
    const days = conferenceDays({
      startAt: new Date("2026-08-15T16:00:00.000Z"),
      endAt: new Date("2026-08-17T23:00:00.000Z"),
      timezone: "America/Los_Angeles",
    });
    expect(days.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(days[0].label).toBe("Sat, Aug 15");
    expect(days[2].label).toBe("Mon, Aug 17");
  });
});

describe("ticketCoversDay", () => {
  it("empty dayAccess covers every day", () => {
    expect(ticketCoversDay([], 1)).toBe(true);
    expect(ticketCoversDay([], 3)).toBe(true);
  });
  it("a Day-2 pass covers only day 2", () => {
    expect(ticketCoversDay([2], 2)).toBe(true);
    expect(ticketCoversDay([2], 1)).toBe(false);
    expect(ticketCoversDay([2], 3)).toBe(false);
  });
  it("combined day passes cover their days", () => {
    expect(ticketCoversDay([1, 3], 1)).toBe(true);
    expect(ticketCoversDay([1, 3], 3)).toBe(true);
    expect(ticketCoversDay([1, 3], 2)).toBe(false);
  });
});

describe("dayAccessLabel", () => {
  const days3 = conferenceDays({
    startAt: new Date("2026-08-15T16:00:00.000Z"),
    endAt: new Date("2026-08-17T23:00:00.000Z"),
    timezone: "America/Los_Angeles",
  });
  it("empty on a single-day event", () => {
    const days1 = conferenceDays({
      startAt: new Date("2026-08-15T16:00:00.000Z"),
      endAt: new Date("2026-08-16T01:00:00.000Z"),
      timezone: "America/Los_Angeles",
    });
    expect(dayAccessLabel([], days1)).toBe("");
    expect(dayAccessLabel([1], days1)).toBe("");
  });
  it("'All days' for empty or full coverage on a multi-day event", () => {
    expect(dayAccessLabel([], days3)).toBe("All days");
    expect(dayAccessLabel([1, 2, 3], days3)).toBe("All days");
  });
  it("'Day N' for partial coverage", () => {
    expect(dayAccessLabel([2], days3)).toBe("Day 2");
    expect(dayAccessLabel([3, 1], days3)).toBe("Day 1, 3");
  });
});

describe("sessionsOverlap", () => {
  const at = (s: string, e: string) => ({ startAt: new Date(s), endAt: new Date(e) });
  it("overlapping ranges", () => {
    expect(sessionsOverlap(at("2026-08-16T17:00:00Z", "2026-08-16T18:00:00Z"), at("2026-08-16T17:30:00Z", "2026-08-16T18:30:00Z"))).toBe(true);
  });
  it("one contained in the other", () => {
    expect(sessionsOverlap(at("2026-08-16T17:00:00Z", "2026-08-16T19:00:00Z"), at("2026-08-16T17:30:00Z", "2026-08-16T18:00:00Z"))).toBe(true);
  });
  it("touching edge does NOT count as overlap", () => {
    expect(sessionsOverlap(at("2026-08-16T17:00:00Z", "2026-08-16T18:00:00Z"), at("2026-08-16T18:00:00Z", "2026-08-16T19:00:00Z"))).toBe(false);
  });
  it("disjoint ranges", () => {
    expect(sessionsOverlap(at("2026-08-16T17:00:00Z", "2026-08-16T18:00:00Z"), at("2026-08-16T19:00:00Z", "2026-08-16T20:00:00Z"))).toBe(false);
  });
});

describe("sessionSeatState", () => {
  it("reflects my own reservation first", () => {
    expect(sessionSeatState({ capacity: 10, seated: 10, myStatus: "SEAT" })).toBe("reserved");
    expect(sessionSeatState({ capacity: 10, seated: 10, myStatus: "WAITLIST" })).toBe("waitlisted");
  });
  it("open when seats remain, full when not", () => {
    expect(sessionSeatState({ capacity: 10, seated: 9, myStatus: null })).toBe("open");
    expect(sessionSeatState({ capacity: 10, seated: 10, myStatus: null })).toBe("full");
    expect(sessionSeatState({ capacity: 10, seated: 11, myStatus: null })).toBe("full");
  });
  it("uncapped is open (reservation N/A)", () => {
    expect(sessionSeatState({ capacity: null, seated: 0, myStatus: null })).toBe("open");
  });
});

describe("conference span entitlements", () => {
  it("free = 1 day, premium = 7 days", () => {
    expect(eventEntitlements(false).maxConferenceDays).toBe(FREE_EVENT_MAX_DAYS);
    expect(eventEntitlements(false).maxConferenceDays).toBe(1);
    expect(eventEntitlements(true).maxConferenceDays).toBe(PREMIUM_EVENT_MAX_DAYS);
    expect(eventEntitlements(true).maxConferenceDays).toBe(7);
  });
  it("day-scoped tickets are premium-only", () => {
    expect(eventEntitlements(false).dayScopedTickets).toBe(false);
    expect(eventEntitlements(true).dayScopedTickets).toBe(true);
  });
  it("span gate: rejects 2-day free / 8-day premium, accepts 7-day premium", () => {
    const span = (days: number) => ({
      startAt: new Date("2026-08-15T16:00:00.000Z"),
      endAt: new Date(`2026-08-${String(14 + days).padStart(2, "0")}T23:00:00.000Z`),
      timezone: "America/Los_Angeles",
    });
    const overFree = conferenceDayCount(span(2)) > eventEntitlements(false).maxConferenceDays;
    const overPremium = conferenceDayCount(span(8)) > eventEntitlements(true).maxConferenceDays;
    const okPremium = conferenceDayCount(span(7)) > eventEntitlements(true).maxConferenceDays;
    expect(overFree).toBe(true);
    expect(overPremium).toBe(true);
    expect(okPremium).toBe(false);
  });
});
