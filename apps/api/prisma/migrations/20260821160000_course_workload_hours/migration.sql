-- AlterTable
ALTER TABLE "courses" ADD COLUMN "workload_hours" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN "workload_hours" INTEGER NOT NULL DEFAULT 0;
