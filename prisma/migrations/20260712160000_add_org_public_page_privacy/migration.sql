-- Public-page privacy controls for organizations.
-- showTeamPhones: when false (default) the Organizers section on /o/[slug]
--   hides each member's phone number (emails still show).
-- showPrivateEvents: when true (default) PRIVATE events appear on the org's own
--   public page (never on app-wide discovery). Set false to hide them there too.
ALTER TABLE "organizations"
  ADD COLUMN "showTeamPhones" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showPrivateEvents" BOOLEAN NOT NULL DEFAULT true;
