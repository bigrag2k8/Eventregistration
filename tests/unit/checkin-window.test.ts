import { describe, it, expect } from "vitest";
import {
  checkinWindow,
  checkinWindowState,
  CHECKIN_OPENS_BEFORE_DEFAULT,
  CHECKIN_CLOSES_AFTER_DEFAULT,
} from "@/lib/checkin-window";

// A 1-hour event starting at a fixed instant, with default 2h/2h window.
const start = new Date("2026-07-17T18:00:00.000Z");
const end = new Date("2026-07-17T19:00:00.000Z");
const event = {
  startAt: start,
  endAt: end,
  checkinOpensMinutesBefore: CHECKIN_OPENS_BEFORE_DEFAULT,
  checkinClosesMinutesAfter: CHECKIN_CLOSES_AFTER_DEFAULT,
};

describe("checkin-window", () => {
  it("computes opens/closes from the minute offsets", () => {
    const win = checkinWindow(event);
    expect(win.opensAt.toISOString()).toBe("2026-07-17T16:00:00.000Z"); // 2h before start
    expect(win.closesAt.toISOString()).toBe("2026-07-17T21:00:00.000Z"); // 2h after end
  });

  it("blocks scans well before the window opens", () => {
    const win = checkinWindow(event);
    const dayBefore = new Date("2026-07-16T18:00:00.000Z");
    expect(checkinWindowState(win, dayBefore)).toBe("TOO_EARLY");
  });

  it("allows scans during the event and inside the grace edges", () => {
    const win = checkinWindow(event);
    expect(checkinWindowState(win, start)).toBe("OPEN");
    expect(checkinWindowState(win, new Date("2026-07-17T16:30:00.000Z"))).toBe("OPEN"); // 90m early, inside window
    expect(checkinWindowState(win, new Date("2026-07-17T20:30:00.000Z"))).toBe("OPEN"); // 90m after end, inside grace
  });

  it("blocks scans after the window closes", () => {
    const win = checkinWindow(event);
    expect(checkinWindowState(win, new Date("2026-07-17T22:00:00.000Z"))).toBe("TOO_LATE");
  });

  it("treats the exact boundaries as open", () => {
    const win = checkinWindow(event);
    expect(checkinWindowState(win, win.opensAt)).toBe("OPEN");
    expect(checkinWindowState(win, win.closesAt)).toBe("OPEN");
  });

  it("honors a widened window (all-day walk-in)", () => {
    const walkIn = { ...event, checkinOpensMinutesBefore: 100000 };
    const win = checkinWindow(walkIn);
    const wayEarly = new Date("2026-07-15T09:00:00.000Z");
    expect(checkinWindowState(win, wayEarly)).toBe("OPEN");
  });
});
