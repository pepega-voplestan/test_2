-- Rename is_fixed to is_pinned
ALTER TABLE "shouts" RENAME COLUMN "is_fixed" TO "is_pinned";

-- Only one shout can be pinned at a time
CREATE UNIQUE INDEX "idx_shouts_single_pinned" ON "shouts"("is_pinned") WHERE "is_pinned" = 1;
