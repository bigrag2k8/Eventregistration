-- Homepage hero banner framing (object-position + zoom, or fit-to-frame),
-- matching the per-event banner controls.
ALTER TABLE "platform_config" ADD COLUMN "heroPositionX" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "platform_config" ADD COLUMN "heroPositionY" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "platform_config" ADD COLUMN "heroZoom" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "platform_config" ADD COLUMN "heroFitToFrame" BOOLEAN NOT NULL DEFAULT false;
