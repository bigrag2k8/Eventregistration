-- "Fit to frame" toggle on event banners. When true, the public page uses
-- object-fit:contain so the whole image shows (with letterbox/pillarbox if
-- the aspect ratio doesn't match). When false (default), object-fit:cover
-- crops to fill the 16:6 frame using the position/zoom values.
ALTER TABLE "events" ADD COLUMN "bannerFitToFrame" BOOLEAN NOT NULL DEFAULT false;
