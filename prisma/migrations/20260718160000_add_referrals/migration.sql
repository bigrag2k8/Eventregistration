-- Invite-an-organizer referrals.
ALTER TABLE "organizations" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "organizations" ADD COLUMN "referredByOrgId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);

-- Backfill a unique referral code for every existing org (10 hex chars from a
-- random md5). Collisions at this scale are effectively impossible; the unique
-- index below would surface one if it ever happened.
UPDATE "organizations" SET "referralCode" = substr(md5(random()::text || id), 1, 10) WHERE "referralCode" IS NULL;

CREATE UNIQUE INDEX "organizations_referralCode_key" ON "organizations"("referralCode");

CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL,
    "referrerOrgId" TEXT NOT NULL,
    "referredOrgId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referral_rewards_referredOrgId_key" ON "referral_rewards"("referredOrgId");
CREATE INDEX "referral_rewards_referrerOrgId_idx" ON "referral_rewards"("referrerOrgId");
ALTER TABLE "referral_rewards"
  ADD CONSTRAINT "referral_rewards_referrerOrgId_fkey"
  FOREIGN KEY ("referrerOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
