-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN "completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "enrollments_completed_at_idx" ON "enrollments"("completed_at");

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module_video_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "last_position_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_progress_user_id_course_id_idx" ON "lesson_progress"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_course_id_completed_at_idx" ON "lesson_progress"("course_id", "completed_at");

-- CreateIndex
CREATE INDEX "lesson_progress_module_video_id_idx" ON "lesson_progress"("module_video_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_module_video_id_key" ON "lesson_progress"("user_id", "module_video_id");

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_module_video_id_fkey" FOREIGN KEY ("module_video_id") REFERENCES "module_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
