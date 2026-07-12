-- Reviews Phase 2: reminder dedup, per-event rating cache, reputation score,
-- and optional sub-ratings.
ALTER TABLE "registrations" ADD COLUMN "reviewRemindedAt" TIMESTAMP(3);

ALTER TABLE "events" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "events" ADD COLUMN "ratingAvg" DECIMAL(3,2);

ALTER TABLE "organizations" ADD COLUMN "reputationScore" DECIMAL(5,2);

ALTER TABLE "reviews" ADD COLUMN "ratingVenue" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "ratingValue" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "ratingOrganization" INTEGER;
