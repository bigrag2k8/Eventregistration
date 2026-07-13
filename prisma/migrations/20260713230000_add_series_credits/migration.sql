-- Series monetization: $34.99 series credits (org counter) + premium flag on
-- series (bundle/unlimited-regs/branding gate). Free tier = 1 active series,
-- drop-in only.
ALTER TABLE "organizations" ADD COLUMN "seriesCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_series" ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false;
