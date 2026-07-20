-- Conference format flag. Additive; every existing event is a standard event.
ALTER TABLE "events" ADD COLUMN "isConference" BOOLEAN NOT NULL DEFAULT false;
