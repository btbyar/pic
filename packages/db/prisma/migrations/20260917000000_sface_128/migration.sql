-- [гараар] Нүүр таних модель: InsightFace ArcFace (512) → SFace (128). docs/ARCHITECTURE.md шийдвэр #8.
-- Prisma `Unsupported("vector(N)")`-ийн хэмжээ өөрчлөлтийг diff-ээр гаргадаггүй тул гараар бичсэн.
--
-- Хэмжээ өөр вектор хөрвүүлэх боломжгүй. Phase 3-аас өмнө embedding үүсээгүй тул устгах нь аюулгүй;
-- ирээдүйд модель солиход энэ аргыг БҮҮ давт — шинэ model_version-оор дахин индексжүүлнэ (§3).
DELETE FROM "biometric"."face_embedding";
UPDATE "biometric"."search_session" SET "query_embedding" = NULL;

ALTER TABLE "biometric"."face_embedding" ALTER COLUMN "embedding" TYPE vector(128);
ALTER TABLE "biometric"."search_session" ALTER COLUMN "query_embedding" TYPE vector(128);
