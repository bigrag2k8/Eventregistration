-- F-05: backfill accessToken for legacy registration rows created before the
-- token existed. Those rows were served by id alone on the ICS route (IDOR on
-- old rows); once every row has a token, the route can require it
-- unconditionally. New registrations already get a token in application code.
--
-- Token = two concatenated UUIDs (hex, URL-safe, ~244 bits of entropy) so no
-- pgcrypto extension is required — gen_random_uuid() is built into Postgres 13+.
-- Evaluated per row, so each backfilled registration gets a distinct token.
-- (Table is "registrations" via @@map; the column keeps its camelCase name.)
UPDATE "registrations"
SET "accessToken" =
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "accessToken" IS NULL;
