ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "title" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "release_date" VARCHAR(20) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "idx_announcements_active";
CREATE INDEX "idx_announcements_active" ON "announcements"("is_deleted", "release_date");
