-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'INSTITUTION_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'INSTITUTION_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INSTITUTION_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'ENROLLMENT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ENROLLMENT_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'TEACHER_ASSIGN';
ALTER TYPE "AuditAction" ADD VALUE 'TEACHER_UNASSIGN';
ALTER TYPE "AuditAction" ADD VALUE 'INSTITUTION_COURSE_LINK';
ALTER TYPE "AuditAction" ADD VALUE 'INSTITUTION_COURSE_UNLINK';
