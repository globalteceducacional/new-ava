import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  GradeSubmissionDto,
  SubmitActivityDto,
  UpdateActivityDto,
} from './dto/activity.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('courses/:courseId/activities')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  listByCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.listByCourse(courseId, user);
  }

  @Post('courses/:courseId/activities')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.create(courseId, dto, user);
  }

  @Get('activities/:activityId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('activityId') activityId: string, @CurrentUser() user: AuthUser) {
    return this.activities.get(activityId, user);
  }

  @Patch('activities/:activityId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  update(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.update(activityId, dto, user);
  }

  @Delete('activities/:activityId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  remove(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.softDelete(activityId, user);
  }

  @Post('activities/:activityId/submissions')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  submit(
    @Param('activityId') activityId: string,
    @Body() dto: SubmitActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.submit(activityId, dto, user);
  }

  @Get('activities/:activityId/submissions')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  listSubmissions(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.listSubmissions(activityId, user);
  }

  @Patch('submissions/:submissionId/grade')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  grade(
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activities.grade(submissionId, dto, user);
  }
}
