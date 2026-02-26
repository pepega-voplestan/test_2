-- Add content hiding flags and muting support to shouts
-- All fields have defaults, so this is safe for existing data

ALTER TABLE "shouts" ADD COLUMN "is_spoiler" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shouts" ADD COLUMN "is_nsfw" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shouts" ADD COLUMN "is_politics" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shouts" ADD COLUMN "is_muted" INTEGER NOT NULL DEFAULT 0;
