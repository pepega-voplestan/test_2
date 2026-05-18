-- Drop legacy columns from shouts table.
--
-- media_type / media_url / media_meta: superseded by the media_id FK to the
-- media table; verified 0 rows had non-null values at migration time.
--
-- is_spoiler / is_nsfw / is_politics / is_muted: superseded by visibility_tag.
-- These four columns were added manually via raw SQL during the SQLite -> Postgres
-- migration and were never tracked in Prisma's schema or migration history;
-- IF EXISTS guards are used so this migration is idempotent against
-- environments where the manual ALTER was never run.

ALTER TABLE "shouts"
  DROP COLUMN IF EXISTS "media_type",
  DROP COLUMN IF EXISTS "media_url",
  DROP COLUMN IF EXISTS "media_meta",
  DROP COLUMN IF EXISTS "is_spoiler",
  DROP COLUMN IF EXISTS "is_nsfw",
  DROP COLUMN IF EXISTS "is_politics",
  DROP COLUMN IF EXISTS "is_muted";
