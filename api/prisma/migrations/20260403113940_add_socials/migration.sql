-- CreateTable
CREATE TABLE "socials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
    "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "socials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_socials_user" ON "socials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "socials_user_id_type_key" ON "socials"("user_id", "type");
