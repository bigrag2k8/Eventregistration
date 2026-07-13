-- Recurring event series (Phase 1). A series owns the recurrence rule + ticket
-- template; each occurrence is a full Event row linked via events.seriesId.
CREATE TYPE "SeriesFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "MonthlyMode" AS ENUM ('DAY_OF_MONTH', 'NTH_WEEKDAY');
CREATE TYPE "SeriesStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

CREATE TABLE "event_series" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "bannerUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "SeriesFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "byWeekday" INTEGER[],
    "monthlyMode" "MonthlyMode",
    "startTimeMinutes" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "seriesStart" TIMESTAMP(3) NOT NULL,
    "seriesEnd" TIMESTAMP(3),
    "occurrenceCap" INTEGER,
    "ticketName" TEXT NOT NULL DEFAULT 'General admission',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "status" "SeriesStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "event_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_series_organizationId_slug_key" ON "event_series"("organizationId", "slug");
CREATE INDEX "event_series_status_idx" ON "event_series"("status");

ALTER TABLE "event_series" ADD CONSTRAINT "event_series_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link occurrences back to their series.
ALTER TABLE "events" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "events" ADD COLUMN "occurrenceIndex" INTEGER;
CREATE INDEX "events_seriesId_idx" ON "events"("seriesId");
ALTER TABLE "events" ADD CONSTRAINT "events_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "event_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
