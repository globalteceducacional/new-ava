-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('ASSIGNED', 'SELF');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN "source" "EnrollmentSource" NOT NULL DEFAULT 'ASSIGNED';

-- CreateIndex
CREATE INDEX "enrollments_source_idx" ON "enrollments"("source");
