-- AlterTable
ALTER TABLE "community_replies" ADD COLUMN "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "community_replies_topic_id_parent_id_created_at_idx" ON "community_replies"("topic_id", "parent_id", "created_at");

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
