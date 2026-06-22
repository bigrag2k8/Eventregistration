-- Banner crop framing: lets organizers reposition + zoom an uploaded image
-- without re-uploading. CSS object-position percentages + a zoom multiplier.
ALTER TABLE "events" ADD COLUMN "bannerPositionX" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "events" ADD COLUMN "bannerPositionY" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "events" ADD COLUMN "bannerZoom" DOUBLE PRECISION NOT NULL DEFAULT 1;
