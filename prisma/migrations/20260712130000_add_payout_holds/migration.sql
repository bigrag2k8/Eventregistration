-- Phase 0 payout holds: hold new organizers' ticket funds until 1 day after
-- their event ends, releasing them via the worker. Protects the platform from
-- the "sell hundreds of tickets, then cancel" scenario.

-- New nullable/defaulted columns (non-destructive).
ALTER TABLE "organizations" ADD COLUMN "fastPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "payoutReleasedAt" TIMESTAMP(3);

-- Grandfather EXISTING organizers onto fast (daily) payouts — they are already
-- on Stripe's daily schedule and may be mid-event, so we must not freeze them.
-- Only NEW signups (rows created after this migration) inherit DEFAULT false = held.
UPDATE "organizations" SET "fastPayoutsEnabled" = true;
