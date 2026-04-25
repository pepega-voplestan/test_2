-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "reply_to" TEXT;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "comments"("id") ON DELETE SET NULL;
