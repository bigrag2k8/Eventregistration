-- Bundle purchases create one Payment row per covered session, all sharing
-- the single PaymentIntent — the old UNIQUE constraint made the second share
-- fail with P2002 and rolled back the whole bundle finalization (caught in
-- the live money-path test). Relax to a plain lookup index.
DROP INDEX "payments_stripePaymentIntentId_key";
CREATE INDEX "payments_stripePaymentIntentId_idx" ON "payments"("stripePaymentIntentId");
