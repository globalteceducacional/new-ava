-- AlterTable
ALTER TABLE "activities" ADD COLUMN "module_id" TEXT;

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN "module_id" TEXT;

-- CreateIndex
CREATE INDEX "activities_module_id_idx" ON "activities"("module_id");

-- CreateIndex
CREATE INDEX "quizzes_module_id_idx" ON "quizzes"("module_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
