-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateIndex
CREATE INDEX "idx_announcements_active" ON "announcements"("is_deleted", "created_at");
