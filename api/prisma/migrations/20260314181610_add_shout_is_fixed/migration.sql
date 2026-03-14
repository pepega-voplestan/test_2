-- AlterTable: add is_fixed column to shouts
ALTER TABLE "shouts" ADD COLUMN "is_fixed" INTEGER NOT NULL DEFAULT 0;
