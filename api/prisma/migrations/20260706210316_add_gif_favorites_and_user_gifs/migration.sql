-- CreateTable
CREATE TABLE "gif_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "still" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gif_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_gifs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_gifs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_gif_favorites_user" ON "gif_favorites"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gif_favorites_user_id_provider_external_id_key" ON "gif_favorites"("user_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "idx_user_gifs_user_active" ON "user_gifs"("user_id", "is_deleted", "created_at");

-- AddForeignKey
ALTER TABLE "gif_favorites" ADD CONSTRAINT "gif_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gifs" ADD CONSTRAINT "user_gifs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gifs" ADD CONSTRAINT "user_gifs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
