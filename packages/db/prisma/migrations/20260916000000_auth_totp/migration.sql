-- AlterTable
ALTER TABLE "user" ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_pending_secret_enc" TEXT;

