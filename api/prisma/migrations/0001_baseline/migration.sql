-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "email" TEXT,
    "is_banned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateTable
CREATE TABLE "shouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "content" TEXT NOT NULL,
    "media_id" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "media_type" TEXT,
    "media_url" TEXT,
    "media_meta" TEXT,
    CONSTRAINT "shouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shouts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "shouts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shouts_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "media_meta" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shout_likes" (
    "shout_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY ("shout_id", "user_id"),
    CONSTRAINT "shout_likes_shout_id_fkey" FOREIGN KEY ("shout_id") REFERENCES "shouts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shout_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comments" (
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

-- CreateTable
CREATE TABLE "comment_likes" (
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY ("comment_id", "user_id"),
    CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification_codes" (
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

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_shouts_parent_created" ON "shouts"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_shouts_created" ON "shouts"("created_at");

-- CreateIndex
CREATE INDEX "idx_likes_shout" ON "shout_likes"("shout_id");

-- CreateIndex
CREATE INDEX "idx_likes_user" ON "shout_likes"("user_id");

-- CreateIndex
CREATE INDEX "idx_comments_shout_created" ON "comments"("shout_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_comments_user" ON "comments"("user_id");

-- CreateIndex
CREATE INDEX "idx_comment_likes_comment" ON "comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "idx_comment_likes_user" ON "comment_likes"("user_id");

-- CreateIndex
CREATE INDEX "idx_verification_codes_email_purpose" ON "verification_codes"("email", "purpose", "used");

