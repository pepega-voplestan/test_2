-- AlterTable: add is_pinned column to shouts
ALTER TABLE "shouts" ADD COLUMN "is_pinned" INTEGER NOT NULL DEFAULT 0;

-- Only one shout can be pinned at a time
CREATE UNIQUE INDEX "idx_shouts_single_pinned" ON "shouts"("is_pinned") WHERE "is_pinned" = 1;
