-- =====================================================================
--  0001 init
--  Бүтэц: [гараар] prelude → [prisma migrate diff] → [гараар] postlude
-- =====================================================================

-- [гараар] pgvector. Prod дээр superuser урьдчилан үүсгэсэн байх ёстой.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- [prisma migrate diff --from-empty --to-schema prisma/schema.prisma]
-- ---------------------------------------------------------------------

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "biometric";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PHOTOGRAPHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'DERIVED', 'INDEXED', 'FAILED');

-- CreateEnum
CREATE TYPE "BibSource" AS ENUM ('OCR', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PricingKind" AS ENUM ('SINGLE', 'BUNDLE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "RemovalStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMPTZ(3),
    "recovery_code_hashes" TEXT[],
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photographer_profile" (
    "user_id" UUID NOT NULL,
    "revenue_share_pct" INTEGER NOT NULL DEFAULT 70,
    "bank_name" TEXT,
    "bank_account_enc" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "suspended_at" TIMESTAMPTZ(3),
    "suspend_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "photographer_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "mfa_passed_at" TIMESTAMPTZ(3),
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    "owner_id" UUID NOT NULL,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'HIDDEN',
    "access_token_hash" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "price_per_photo" INTEGER NOT NULL,
    "bundle_price" INTEGER,
    "retention_days" INTEGER NOT NULL DEFAULT 180,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "bib_pattern" TEXT,
    "face_search_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cover_photo_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_photographer" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clock_offset_sec" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_photographer_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "upload_batch" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "photographer_id" UUID NOT NULL,
    "total_files" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "photographer_id" UUID NOT NULL,
    "upload_batch_id" UUID,
    "original_filename" TEXT NOT NULL,
    "storage_keys" JSONB NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "captured_at_raw" TIMESTAMPTZ(3),
    "captured_at" TIMESTAMPTZ(3),
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'UPLOADING',
    "failure_reason" TEXT,
    "face_count" INTEGER NOT NULL DEFAULT 0,
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_reason" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bib_detection" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "bib_number" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "bbox" JSONB NOT NULL,
    "source" "BibSource" NOT NULL DEFAULT 'OCR',
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bib_detection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric"."face_embedding" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "embedding" vector(512) NOT NULL,
    "bbox" JSONB NOT NULL,
    "det_score" DOUBLE PRECISION NOT NULL,
    "face_size_px" INTEGER NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric"."search_session" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "query_embedding" vector(512),
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "event_title_snap" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total_amount" INTEGER NOT NULL,
    "access_token_hash" TEXT NOT NULL,
    "contact_email" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "photo_id" UUID,
    "photo_filename_snap" TEXT NOT NULL,
    "photographer_id" UUID NOT NULL,
    "pricing" "PricingKind" NOT NULL DEFAULT 'SINGLE',
    "price" INTEGER NOT NULL,
    "photographer_share_pct" INTEGER NOT NULL,
    "photographer_amount" INTEGER NOT NULL,
    "platform_amount" INTEGER NOT NULL,
    "refund_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_invoice_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "provider_ref" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "photo_id" UUID,
    "ip_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" UUID NOT NULL,
    "photographer_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "refund_adjust" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(3),
    "paid_by_id" UUID,
    "reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "removal_request" (
    "id" UUID NOT NULL,
    "photo_id" UUID,
    "reason" TEXT NOT NULL,
    "contact" TEXT,
    "status" "RemovalStatus" NOT NULL DEFAULT 'NEW',
    "handled_by_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "removal_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event_daily_stat" (
    "event_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_daily_stat_pkey" PRIMARY KEY ("event_id","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_slug_key" ON "event"("slug");

-- CreateIndex
CREATE INDEX "event_visibility_starts_at_idx" ON "event"("visibility", "starts_at");

-- CreateIndex
CREATE INDEX "event_expires_at_idx" ON "event"("expires_at");

-- CreateIndex
CREATE INDEX "event_owner_id_idx" ON "event"("owner_id");

-- CreateIndex
CREATE INDEX "event_photographer_user_id_idx" ON "event_photographer"("user_id");

-- CreateIndex
CREATE INDEX "upload_batch_event_id_idx" ON "upload_batch"("event_id");

-- CreateIndex
CREATE INDEX "photo_event_id_captured_at_idx" ON "photo"("event_id", "captured_at");

-- CreateIndex
CREATE INDEX "photo_event_id_processing_status_idx" ON "photo"("event_id", "processing_status");

-- CreateIndex
CREATE INDEX "photo_photographer_id_idx" ON "photo"("photographer_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_event_id_sha256_key" ON "photo"("event_id", "sha256");

-- CreateIndex
CREATE INDEX "bib_detection_event_id_bib_number_idx" ON "bib_detection"("event_id", "bib_number");

-- CreateIndex
CREATE INDEX "bib_detection_photo_id_idx" ON "bib_detection"("photo_id");

-- CreateIndex
CREATE INDEX "face_embedding_event_id_model_version_idx" ON "biometric"."face_embedding"("event_id", "model_version");

-- CreateIndex
CREATE INDEX "face_embedding_photo_id_idx" ON "biometric"."face_embedding"("photo_id");

-- CreateIndex
CREATE INDEX "search_session_expires_at_idx" ON "biometric"."search_session"("expires_at");

-- CreateIndex
CREATE INDEX "order_status_created_at_idx" ON "order"("status", "created_at");

-- CreateIndex
CREATE INDEX "order_event_id_idx" ON "order"("event_id");

-- CreateIndex
CREATE INDEX "order_item_photographer_id_created_at_idx" ON "order_item"("photographer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_order_id_photo_id_key" ON "order_item"("order_id", "photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_invoice_id_key" ON "payment"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "payment_order_id_idx" ON "payment"("order_id");

-- CreateIndex
CREATE INDEX "payment_status_created_at_idx" ON "payment"("status", "created_at");

-- CreateIndex
CREATE INDEX "refund_order_id_idx" ON "refund"("order_id");

-- CreateIndex
CREATE INDEX "refund_created_at_idx" ON "refund"("created_at");

-- CreateIndex
CREATE INDEX "download_order_item_id_idx" ON "download"("order_item_id");

-- CreateIndex
CREATE INDEX "download_created_at_idx" ON "download"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_photographer_id_period_key" ON "payout"("photographer_id", "period");

-- CreateIndex
CREATE INDEX "removal_request_status_created_at_idx" ON "removal_request"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "photographer_profile" ADD CONSTRAINT "photographer_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photographer_profile" ADD CONSTRAINT "photographer_profile_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photographer" ADD CONSTRAINT "event_photographer_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photographer" ADD CONSTRAINT "event_photographer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bib_detection" ADD CONSTRAINT "bib_detection_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bib_detection" ADD CONSTRAINT "bib_detection_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric"."face_embedding" ADD CONSTRAINT "face_embedding_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric"."face_embedding" ADD CONSTRAINT "face_embedding_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric"."search_session" ADD CONSTRAINT "search_session_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download" ADD CONSTRAINT "download_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download" ADD CONSTRAINT "download_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "removal_request" ADD CONSTRAINT "removal_request_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "removal_request" ADD CONSTRAINT "removal_request_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_daily_stat" ADD CONSTRAINT "event_daily_stat_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- [гараар] CHECK constraint — Prisma schema-д илэрхийлэх боломжгүй бизнес дүрэм
-- =====================================================================

ALTER TABLE "user" ADD CONSTRAINT "user_email_lowercase" CHECK ("email" = lower("email"));

ALTER TABLE "photographer_profile" ADD CONSTRAINT "photographer_profile_share_pct_range"
  CHECK ("revenue_share_pct" BETWEEN 0 AND 100);

ALTER TABLE "event" ADD CONSTRAINT "event_prices_non_negative"
  CHECK ("price_per_photo" >= 0 AND ("bundle_price" IS NULL OR "bundle_price" >= 0));
ALTER TABLE "event" ADD CONSTRAINT "event_retention_days_range"
  CHECK ("retention_days" BETWEEN 1 AND 3650);
ALTER TABLE "event" ADD CONSTRAINT "event_time_order" CHECK ("ends_at" >= "starts_at");
ALTER TABLE "event" ADD CONSTRAINT "event_unlisted_has_token"
  CHECK ("visibility" <> 'UNLISTED' OR "access_token_hash" IS NOT NULL);

ALTER TABLE "order" ADD CONSTRAINT "order_total_non_negative" CHECK ("total_amount" >= 0);

ALTER TABLE "order_item" ADD CONSTRAINT "order_item_amounts_valid" CHECK (
  "price" >= 0
  AND "photographer_share_pct" BETWEEN 0 AND 100
  AND "photographer_amount" >= 0
  AND "platform_amount" >= 0
  AND "photographer_amount" + "platform_amount" = "price"
);

ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "refund" ADD CONSTRAINT "refund_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "refund" ADD CONSTRAINT "refund_reason_not_blank" CHECK (length(btrim("reason")) > 0);

ALTER TABLE "payout" ADD CONSTRAINT "payout_period_format"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "biometric"."face_embedding" ADD CONSTRAINT "face_embedding_face_size_non_negative"
  CHECK ("face_size_px" >= 0);

-- Приваси: хайлтын embedding 24 цагаас удаан хадгалагдах боломжгүй (DB түвшинд)
ALTER TABLE "biometric"."search_session" ADD CONSTRAINT "search_session_ttl_max_24h"
  CHECK ("expires_at" <= "created_at" + interval '24 hours');

-- =====================================================================
-- [гараар] Audit log — зөвхөн INSERT
-- =====================================================================

CREATE OR REPLACE FUNCTION "audit_log_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_immutable"();

-- =====================================================================
-- [гараар] DB role — админ biometric schema-д хандах эрхгүй
--   pic_app_role   : API, worker (public + biometric)
--   pic_admin_role : админ модуль (зөвхөн public)
--   Login хэрэглэгчийг (нууц үгтэй) migration биш, ops/init скрипт үүсгэнэ.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_app_role') THEN
    CREATE ROLE pic_app_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_admin_role') THEN
    CREATE ROLE pic_admin_role NOLOGIN;
  END IF;
END
$$;

-- public
GRANT USAGE ON SCHEMA public TO pic_app_role, pic_admin_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pic_app_role, pic_admin_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pic_app_role, pic_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pic_app_role, pic_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pic_app_role, pic_admin_role;

-- biometric: зөвхөн app
REVOKE ALL ON SCHEMA biometric FROM PUBLIC;
GRANT USAGE ON SCHEMA biometric TO pic_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA biometric TO pic_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA biometric
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pic_app_role;

-- audit_log: хэн ч засах/устгах эрхгүй
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM pic_app_role, pic_admin_role;

-- Prisma migration хүснэгт: runtime role-ууд өөрчлөх эрхгүй
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM pic_app_role, pic_admin_role;
  END IF;
END
$$;
