-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('RUNNING', 'CYCLING', 'SPORTS', 'GRADUATION', 'FESTIVAL', 'CONCERT', 'CELEBRATION', 'CORPORATE', 'OTHER');

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "category" "EventCategory" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "event_visibility_category_starts_at_idx" ON "event"("visibility", "category", "starts_at");

