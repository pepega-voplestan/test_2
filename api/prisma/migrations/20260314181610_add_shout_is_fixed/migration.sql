/*
  Warnings:

  - You are about to drop the column `is_nsfw` on the `shouts` table. All the data in the column will be lost.
  - You are about to drop the column `is_politics` on the `shouts` table. All the data in the column will be lost.
  - You are about to drop the column `is_spoiler` on the `shouts` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "new_announcements" ("content", "created_at", "id", "is_deleted") SELECT "content", "created_at", "id", "is_deleted" FROM "announcements";
DROP TABLE "announcements";
ALTER TABLE "new_announcements" RENAME TO "announcements";
CREATE INDEX "idx_announcements_active" ON "announcements"("is_deleted", "created_at");
CREATE TABLE "new_comment_likes" (
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY ("comment_id", "user_id"),
    CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_comment_likes" ("comment_id", "created_at", "user_id") SELECT "comment_id", "created_at", "user_id" FROM "comment_likes";
DROP TABLE "comment_likes";
ALTER TABLE "new_comment_likes" RENAME TO "comment_likes";
CREATE INDEX "idx_comment_likes_comment" ON "comment_likes"("comment_id");
CREATE INDEX "idx_comment_likes_user" ON "comment_likes"("user_id");
CREATE TABLE "new_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shout_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "media_id" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "comments_shout_id_fkey" FOREIGN KEY ("shout_id") REFERENCES "shouts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "comments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_comments" ("content", "created_at", "id", "is_deleted", "media_id", "shout_id", "user_id") SELECT "content", "created_at", "id", "is_deleted", "media_id", "shout_id", "user_id" FROM "comments";
DROP TABLE "comments";
ALTER TABLE "new_comments" RENAME TO "comments";
CREATE INDEX "idx_comments_shout_created" ON "comments"("shout_id", "created_at");
CREATE INDEX "idx_comments_user" ON "comments"("user_id");
CREATE TABLE "new_ignored_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_user_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "ignored_users_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ignored_users_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ignored_users" ("created_at", "id", "owner_user_id", "target_user_id", "updated_at") SELECT "created_at", "id", "owner_user_id", "target_user_id", "updated_at" FROM "ignored_users";
DROP TABLE "ignored_users";
ALTER TABLE "new_ignored_users" RENAME TO "ignored_users";
CREATE UNIQUE INDEX "ignored_users_owner_user_id_target_user_id_key" ON "ignored_users"("owner_user_id", "target_user_id");
CREATE TABLE "new_media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "media_meta" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_media" ("created_at", "id", "media_meta", "media_type", "media_url", "user_id") SELECT "created_at", "id", "media_meta", "media_type", "media_url", "user_id" FROM "media";
DROP TABLE "media";
ALTER TABLE "new_media" RENAME TO "media";
CREATE TABLE "new_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shout_id" TEXT,
    "comment_id" TEXT,
    "is_read" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notifications_shout_id_fkey" FOREIGN KEY ("shout_id") REFERENCES "shouts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_notifications" ("actor_id", "comment_id", "created_at", "id", "is_read", "shout_id", "type", "user_id") SELECT "actor_id", "comment_id", "created_at", "id", "is_read", "shout_id", "type", "user_id" FROM "notifications";
DROP TABLE "notifications";
ALTER TABLE "new_notifications" RENAME TO "notifications";
CREATE INDEX "idx_notifications_user_unread" ON "notifications"("user_id", "is_read", "created_at");
CREATE TABLE "new_shout_likes" (
    "shout_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY ("shout_id", "user_id"),
    CONSTRAINT "shout_likes_shout_id_fkey" FOREIGN KEY ("shout_id") REFERENCES "shouts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shout_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_shout_likes" ("created_at", "shout_id", "user_id") SELECT "created_at", "shout_id", "user_id" FROM "shout_likes";
DROP TABLE "shout_likes";
ALTER TABLE "new_shout_likes" RENAME TO "shout_likes";
CREATE INDEX "idx_likes_shout" ON "shout_likes"("shout_id");
CREATE INDEX "idx_likes_user" ON "shout_likes"("user_id");
CREATE TABLE "new_shouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "content" TEXT NOT NULL,
    "media_id" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "is_fixed" INTEGER NOT NULL DEFAULT 0,
    "visibility_tag" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "media_type" TEXT,
    "media_url" TEXT,
    "media_meta" TEXT,
    CONSTRAINT "shouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shouts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "shouts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shouts_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shouts" ("content", "created_at", "id", "is_deleted", "media_id", "media_meta", "media_type", "media_url", "parent_id", "user_id", "visibility_tag") SELECT "content", "created_at", "id", "is_deleted", "media_id", "media_meta", "media_type", "media_url", "parent_id", "user_id", "visibility_tag" FROM "shouts";
DROP TABLE "shouts";
ALTER TABLE "new_shouts" RENAME TO "shouts";
CREATE INDEX "idx_shouts_parent_created" ON "shouts"("parent_id", "created_at");
CREATE INDEX "idx_shouts_created" ON "shouts"("created_at");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "email" TEXT,
    "is_banned" INTEGER NOT NULL DEFAULT 0,
    "show_nsfw" INTEGER NOT NULL DEFAULT 0,
    "show_politics" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "new_users" ("avatar", "created_at", "email", "id", "is_banned", "password_hash", "show_nsfw", "show_politics", "username") SELECT "avatar", "created_at", "email", "id", "is_banned", "password_hash", "show_nsfw", "show_politics", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "new_verification_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payload" TEXT,
    "expires_at" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "new_verification_codes" ("attempts", "code", "created_at", "email", "expires_at", "id", "payload", "purpose", "used") SELECT "attempts", "code", "created_at", "email", "expires_at", "id", "payload", "purpose", "used" FROM "verification_codes";
DROP TABLE "verification_codes";
ALTER TABLE "new_verification_codes" RENAME TO "verification_codes";
CREATE INDEX "idx_verification_codes_email_purpose" ON "verification_codes"("email", "purpose", "used");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
