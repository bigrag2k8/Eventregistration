-- Check-in time window: tickets can only be scanned from N minutes before
-- startAt until M minutes after endAt. Defaults (2h / 2h) apply to every
-- existing event; organizers can tune per event. `outsideWindow` flags an
-- organizer override for the audit trail.
ALTER TABLE "events" ADD COLUMN "checkinOpensMinutesBefore" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "events" ADD COLUMN "checkinClosesMinutesAfter" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "check_ins" ADD COLUMN "outsideWindow" BOOLEAN NOT NULL DEFAULT false;
