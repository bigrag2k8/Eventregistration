-- Mailing address fields for Organization. Nullable so existing rows survive;
-- new rows are required to fill them at signup and existing orgs are prompted
-- in /dashboard/settings.
ALTER TABLE "organizations" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "organizations" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "organizations" ADD COLUMN "city" TEXT;
ALTER TABLE "organizations" ADD COLUMN "state" TEXT;
ALTER TABLE "organizations" ADD COLUMN "zipCode" TEXT;
ALTER TABLE "organizations" ADD COLUMN "country" TEXT;
