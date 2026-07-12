-- Event cancellation flow: mark an event CANCELLED but keep it VISIBLE (deletedAt
-- stays null, unlike a soft delete), so attendees see a "cancelled" page. The
-- worker then auto-refunds every paid attendee/vendor and emails them — making
-- the buyer-protection promise ("cancelled events mean guaranteed refunds") real.
-- Non-destructive: both columns are nullable. Reuses the existing CANCELLATION
-- EmailKind, so no enum change.
ALTER TABLE "events" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN "cancelReason" TEXT;
