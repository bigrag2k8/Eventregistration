-- Full-series bundle pricing (recurring events Phase 2a): one purchase =
-- a seat in every remaining session, tracked per-session as normal
-- registrations carrying their share of the money.
ALTER TABLE "event_series" ADD COLUMN "bundlePriceCents" INTEGER;

CREATE TABLE "series_bundle_purchases" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sessionCount" INTEGER NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "series_bundle_purchases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "series_bundle_purchases_seriesId_status_idx" ON "series_bundle_purchases"("seriesId", "status");
CREATE INDEX "series_bundle_purchases_email_idx" ON "series_bundle_purchases"("email");

ALTER TABLE "series_bundle_purchases" ADD CONSTRAINT "series_bundle_purchases_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "event_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registrations" ADD COLUMN "bundlePurchaseId" TEXT;
CREATE INDEX "registrations_bundlePurchaseId_idx" ON "registrations"("bundlePurchaseId");
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_bundlePurchaseId_fkey" FOREIGN KEY ("bundlePurchaseId") REFERENCES "series_bundle_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
