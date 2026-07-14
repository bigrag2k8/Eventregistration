/**
 * Check-in time-window policy. A ticket may only be consumed inside a window
 * around the event: from `checkinOpensMinutesBefore` before startAt until
 * `checkinClosesMinutesAfter` after endAt. This blocks the fraud/abuse case of
 * scanning a ticket in days early (or long after), while a smart default keeps
 * it out of most organizers' way. STAFF/VOLUNTEER are hard-blocked outside the
 * window; ORGANIZER/ADMIN can override (logged) for the legit early arrival.
 */

/** Default: doors "open" 2h before start — covers early arrival + badge pickup. */
export const CHECKIN_OPENS_BEFORE_DEFAULT = 120;
/** Default: check-in stays open 2h past the official end for stragglers. */
export const CHECKIN_CLOSES_AFTER_DEFAULT = 120;

export interface CheckinWindowEvent {
  startAt: Date;
  endAt: Date;
  checkinOpensMinutesBefore: number;
  checkinClosesMinutesAfter: number;
}

export interface CheckinWindow {
  opensAt: Date;
  closesAt: Date;
}

export type CheckinWindowState = "OPEN" | "TOO_EARLY" | "TOO_LATE";

export function checkinWindow(event: CheckinWindowEvent): CheckinWindow {
  return {
    opensAt: new Date(event.startAt.getTime() - event.checkinOpensMinutesBefore * 60_000),
    closesAt: new Date(event.endAt.getTime() + event.checkinClosesMinutesAfter * 60_000),
  };
}

export function checkinWindowState(win: CheckinWindow, now: Date): CheckinWindowState {
  if (now.getTime() < win.opensAt.getTime()) return "TOO_EARLY";
  if (now.getTime() > win.closesAt.getTime()) return "TOO_LATE";
  return "OPEN";
}
