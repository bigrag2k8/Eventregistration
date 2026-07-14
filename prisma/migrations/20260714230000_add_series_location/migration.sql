-- Series location template: venue/address (or virtual link) set once on the
-- series and copied onto every generated occurrence as its EventLocation.
ALTER TABLE "event_series" ADD COLUMN "isVirtual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_series" ADD COLUMN "virtualUrl" TEXT;
ALTER TABLE "event_series" ADD COLUMN "venueName" TEXT;
ALTER TABLE "event_series" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "event_series" ADD COLUMN "city" TEXT;
ALTER TABLE "event_series" ADD COLUMN "state" TEXT;
ALTER TABLE "event_series" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "event_series" ADD COLUMN "country" TEXT;
