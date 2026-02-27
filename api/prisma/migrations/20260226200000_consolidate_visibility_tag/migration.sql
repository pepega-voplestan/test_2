-- Consolidate is_spoiler, is_nsfw, is_politics into a single visibility_tag column
-- Tags are mutually exclusive, so a single string enum is the correct model

ALTER TABLE "shouts" ADD COLUMN "visibility_tag" TEXT NOT NULL DEFAULT '';

-- Migrate existing flag data (priority: spoiler > nsfw > politics)
UPDATE "shouts" SET "visibility_tag" = 'spoiler' WHERE "is_spoiler" = 1;
UPDATE "shouts" SET "visibility_tag" = 'nsfw' WHERE "is_nsfw" = 1 AND "visibility_tag" = '';
UPDATE "shouts" SET "visibility_tag" = 'politics' WHERE "is_politics" = 1 AND "visibility_tag" = '';
