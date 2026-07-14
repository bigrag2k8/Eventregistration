-- SUPERADMIN-editable public homepage hero banner (image + headline + button).
ALTER TABLE "platform_config" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "platform_config" ADD COLUMN "heroHeadline" TEXT;
ALTER TABLE "platform_config" ADD COLUMN "heroSubhead" TEXT;
ALTER TABLE "platform_config" ADD COLUMN "heroCtaText" TEXT;
ALTER TABLE "platform_config" ADD COLUMN "heroCtaHref" TEXT;
