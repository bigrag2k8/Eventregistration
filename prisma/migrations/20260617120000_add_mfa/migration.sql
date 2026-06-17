-- MFA (TOTP): opt-in two-factor for staff roles.
--   mfaEnabled       — whether the account requires a code at sign-in
--   mfaSecret        — AES-256-GCM-encrypted base32 TOTP secret (null when off)
--   mfaRecoveryCodes — SHA-256 hashes of single-use backup codes
ALTER TABLE "users"
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecret" TEXT,
  ADD COLUMN "mfaRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
