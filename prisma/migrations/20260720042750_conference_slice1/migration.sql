-- AlterTable
ALTER TABLE "pass_purchases" RENAME CONSTRAINT "series_bundle_purchases_pkey" TO "pass_purchases_pkey";

-- AlterTable
ALTER TABLE "recurring_events" RENAME CONSTRAINT "event_series_pkey" TO "recurring_events_pkey";

-- AlterTable
ALTER TABLE "ticket_types" ADD COLUMN     "dayAccess" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "event_sessions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "track" TEXT,
    "room" TEXT,
    "speaker" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_sessions_eventId_startAt_idx" ON "event_sessions"("eventId", "startAt");

-- RenameForeignKey
ALTER TABLE "events" RENAME CONSTRAINT "events_seriesId_fkey" TO "events_recurringEventId_fkey";

-- RenameForeignKey
ALTER TABLE "pass_purchases" RENAME CONSTRAINT "series_bundle_purchases_seriesId_fkey" TO "pass_purchases_recurringEventId_fkey";

-- RenameForeignKey
ALTER TABLE "recurring_events" RENAME CONSTRAINT "event_series_organizationId_fkey" TO "recurring_events_organizationId_fkey";

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "events_seriesId_idx" RENAME TO "events_recurringEventId_idx";

-- RenameIndex
ALTER INDEX "series_bundle_purchases_email_idx" RENAME TO "pass_purchases_email_idx";

-- RenameIndex
ALTER INDEX "series_bundle_purchases_seriesId_status_idx" RENAME TO "pass_purchases_recurringEventId_status_idx";

-- RenameIndex
ALTER INDEX "event_series_organizationId_slug_key" RENAME TO "recurring_events_organizationId_slug_key";

-- RenameIndex
ALTER INDEX "event_series_status_idx" RENAME TO "recurring_events_status_idx";
