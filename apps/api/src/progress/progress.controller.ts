import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ImportLessonProgressDto,
  ReportLessonProgressDto,
} from './dto/progress.dto';
import { ProgressService } from './progress.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Post('module-videos/:id/progress')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  report(
    @Param('id') id: string,
    @Body() dto: ReportLessonProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.progress.reportVideoProgress(
      id,
      user,
      dto.currentTime,
      dto.duration,
    );
  }

  @Get('courses/:courseId/lesson-progress')
  @Roles(
    RoleCode.ALUNO,
    RoleCode.ADM_MASTER,
    RoleCode.PROFESSOR,
    RoleCode.ADM_INSTITUICAO,
  )
  courseProgress(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.progress.getCourseProgress(courseId, user);
  }

  /** Migra progresso antigo do localStorage para o servidor. */
  @Post('courses/:courseId/lesson-progress/import')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  importProgress(
    @Param('courseId') courseId: string,
    @Body() dto: ImportLessonProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.progress.importWatched(courseId, user, dto.videoIds ?? []);
  }
}
