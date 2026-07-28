-- Media attachments (feature 006): a shout or comment's attached media is an
-- ordered list of 1..5 rows in shout_media/comment_media — a single video,
-- YouTube reference, or Giphy GIF is a one-row list; a photo gallery is a
-- multi-row list. Same table, same shape, no separate storage for the
-- single-attachment case.

-- CreateTable
CREATE TABLE "shout_media" (
    "shout_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "shout_media_pkey" PRIMARY KEY ("shout_id","position")
);

-- CreateTable
CREATE TABLE "comment_media" (
    "comment_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "comment_media_pkey" PRIMARY KEY ("comment_id","position")
);

-- CreateIndex
CREATE INDEX "idx_shout_media_shout" ON "shout_media"("shout_id");

-- CreateIndex
CREATE INDEX "idx_shout_media_media" ON "shout_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "shout_media_shout_id_media_id_key" ON "shout_media"("shout_id", "media_id");

-- CreateIndex
CREATE INDEX "idx_comment_media_comment" ON "comment_media"("comment_id");

-- CreateIndex
CREATE INDEX "idx_comment_media_media" ON "comment_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "comment_media_comment_id_media_id_key" ON "comment_media"("comment_id", "media_id");

-- AddForeignKey
ALTER TABLE "shout_media" ADD CONSTRAINT "shout_media_shout_id_fkey" FOREIGN KEY ("shout_id") REFERENCES "shouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shout_media" ADD CONSTRAINT "shout_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_media" ADD CONSTRAINT "comment_media_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_media" ADD CONSTRAINT "comment_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing shout/comment with a non-null media_id gets a
-- position-0 row, of whatever type it already was (image, video, youtube,
-- giphy) — there is no type restriction on a single-item list, only on
-- attaching more than one (enforced in application code, not the schema).
INSERT INTO "shout_media" ("shout_id", "media_id", "position")
SELECT s."id", s."media_id", 0
FROM "shouts" s
WHERE s."media_id" IS NOT NULL;

INSERT INTO "comment_media" ("comment_id", "media_id", "position")
SELECT c."id", c."media_id", 0
FROM "comments" c
WHERE c."media_id" IS NOT NULL;

-- Dropping the column also drops its FK constraint and any index on it.
ALTER TABLE "shouts" DROP COLUMN "media_id";
ALTER TABLE "comments" DROP COLUMN "media_id";
