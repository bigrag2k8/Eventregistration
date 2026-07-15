-- Rename the "event series" vocabulary to "recurring event" at the physical layer.
-- All statements are pure RENAMEs: Postgres preserves every row, index, and
-- foreign-key constraint across a RENAME, so this migration is data-safe (no
-- DROP/CREATE, nothing is rebuilt). Only the two @@map physical table names and
-- the columns/enum whose Prisma names changed are touched.

-- Tables (match the old @@map names → new @@map names).
ALTER TABLE "event_series" RENAME TO "recurring_events";
ALTER TABLE "series_bundle_purchases" RENAME TO "pass_purchases";

-- Columns whose Prisma field names changed.
ALTER TABLE "events" RENAME COLUMN "seriesId" TO "recurringEventId";
ALTER TABLE "organizations" RENAME COLUMN "seriesCredits" TO "recurringEventCredits";
ALTER TABLE "pass_purchases" RENAME COLUMN "seriesId" TO "recurringEventId";

-- Enum type: Prisma names the Postgres type after the enum (no @@map), and the
-- enum was renamed SeriesStatus → RecurringEventStatus, so rename the type. The
-- rename automatically updates every column that uses it (recurring_events.status).
ALTER TYPE "SeriesStatus" RENAME TO "RecurringEventStatus";
