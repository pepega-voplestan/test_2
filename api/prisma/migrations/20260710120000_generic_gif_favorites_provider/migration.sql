-- RenameColumn
ALTER TABLE "gif_favorites" RENAME COLUMN "giphy_id" TO "external_id";
ALTER TABLE "gif_favorites" RENAME COLUMN "giphy_url" TO "url";
ALTER TABLE "gif_favorites" RENAME COLUMN "giphy_still" TO "still";

-- AddColumn
ALTER TABLE "gif_favorites" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'giphy';

-- DropIndex
DROP INDEX "gif_favorites_user_id_giphy_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "gif_favorites_user_id_provider_external_id_key" ON "gif_favorites"("user_id", "provider", "external_id");
