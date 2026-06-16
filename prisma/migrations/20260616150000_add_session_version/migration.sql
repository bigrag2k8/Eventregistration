-- NEW-02: per-user session epoch so a password reset invalidates existing JWTs.
-- The value is embedded in each session token (claim "ver"); getSession rejects
-- a token whose "ver" no longer matches the stored sessionVersion. Existing rows
-- and pre-deploy tokens default to 1, so this deploy logs nobody out; a later
-- reset-password bumps the column and invalidates that user's outstanding tokens.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;
