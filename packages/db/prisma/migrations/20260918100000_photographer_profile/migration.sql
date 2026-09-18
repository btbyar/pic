-- Phase 6: зурагчны нийтийн профайл
ALTER TABLE "photographer_profile"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "avatar_key" TEXT;

CREATE UNIQUE INDEX "photographer_profile_slug_key" ON "photographer_profile"("slug");

-- [гараар] URL-д аюулгүй slug, богино био
ALTER TABLE "photographer_profile" ADD CONSTRAINT "photographer_profile_slug_format"
  CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "photographer_profile" ADD CONSTRAINT "photographer_profile_bio_length"
  CHECK ("bio" IS NULL OR length("bio") <= 1000);
