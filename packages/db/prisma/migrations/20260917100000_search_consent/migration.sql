-- Хайлтын session бүр аль зөвшөөрлийн текстийг (packages/shared search.ts CONSENT_VERSION) хүлээн зөвшөөрснийг,
-- аль моделийн embedding-ээр хайсныг хадгална. Хүний мэдээлэл биш.
-- AlterTable
ALTER TABLE "biometric"."search_session" ADD COLUMN     "consent_version" TEXT NOT NULL,
ADD COLUMN     "model_version" TEXT NOT NULL;
