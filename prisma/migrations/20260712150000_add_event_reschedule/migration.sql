-- Event reschedule flow: change a live event's date only through a controlled path
-- that reissues tickets (fresh QR expiry for the new date) and emails every attendee.
-- rescheduledAt marks the latest reschedule; Registration.rescheduleNotifiedAt is the
-- per-attendee dedup so the worker emails each person once per reschedule.
-- Non-destructive: both columns nullable. Reuses the CONFIRMATION EmailKind.
ALTER TABLE "events" ADD COLUMN "rescheduledAt" TIMESTAMP(3);
ALTER TABLE "registrations" ADD COLUMN "rescheduleNotifiedAt" TIMESTAMP(3);
