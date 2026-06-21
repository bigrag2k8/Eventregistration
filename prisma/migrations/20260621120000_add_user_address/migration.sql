-- Personal mailing address fields on User. Optional for everyone — only
-- captured/edited by organizers via /dashboard/team/[userId]/edit.
ALTER TABLE "users" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "users" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "users" ADD COLUMN "city" TEXT;
ALTER TABLE "users" ADD COLUMN "state" TEXT;
ALTER TABLE "users" ADD COLUMN "zipCode" TEXT;
ALTER TABLE "users" ADD COLUMN "country" TEXT;
