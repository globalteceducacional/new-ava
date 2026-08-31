import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CourseAccessService } from './course-access.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseAccessService],
  exports: [CoursesService, CourseAccessService],
})
export class CoursesModule {}
