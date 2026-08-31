import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { ContentItemsController } from './content-items.controller';
import { ContentItemsService } from './content-items.service';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [ContentItemsController],
  providers: [ContentItemsService],
  exports: [ContentItemsService],
})
export class ContentItemsModule {}
