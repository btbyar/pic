-- Phase 5: захиалга, төлбөр, нууц үг сэргээх

-- Захиалга
ALTER TABLE "order"
  ADD COLUMN "access_token_enc" TEXT,
  ADD COLUMN "email_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "payment_due_at" TIMESTAMPTZ(3);

-- Шифрлэсэн токен зөвхөн имэйлээр илгээх зорилготой — имэйлгүй захиалгад хадгалахгүй
ALTER TABLE "order" ADD CONSTRAINT "order_token_enc_requires_email"
  CHECK ("access_token_enc" IS NULL OR "contact_email" IS NOT NULL);

-- Хугацаа нь дууссан төлбөрийг хайх (worker 5 минут тутам)
CREATE INDEX "order_status_payment_due_at_idx" ON "order"("status", "payment_due_at");

-- Нууц үг сэргээх
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_hash" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token"("user_id");
CREATE INDEX "password_reset_token_expires_at_idx" ON "password_reset_token"("expires_at");

ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Токен 1 цагаас удаан хүчинтэй байж болохгүй (код 30 минут тавина)
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_short_lived"
  CHECK ("expires_at" <= "created_at" + interval '1 hour');

-- Админ модуль нууц үг сэргээх токенд хандах шаардлагагүй
REVOKE ALL ON "password_reset_token" FROM pic_admin_role;
