import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModulesContentController } from './modules-content.controller';
import { ModulesContentService } from './modules-content.service';

@Module({
  imports: [AuthModule, CoursesModule, NotificationsModule],
  controllers: [ModulesContentController],
  providers: [ModulesContentService],
  exports: [ModulesContentService],
})
export class ModulesContentModule {}
