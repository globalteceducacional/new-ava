import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [GradesController],
  providers: [GradesService],
})
export class GradesModule {}
