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
import { CreateQuizDto, FinishAttemptDto, UpdateQuizDto } from './dto/quiz.dto';
import { QuizzesService } from './quizzes.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get('courses/:courseId/quizzes')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.listByCourse(courseId, user);
  }

  @Post('courses/:courseId/quizzes')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateQuizDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzes.create(courseId, dto, user);
  }

  @Get('quizzes/:quizId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('quizId') quizId: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.getForStudent(quizId, user);
  }

  @Patch('quizzes/:quizId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  update(
    @Param('quizId') quizId: string,
    @Body() dto: UpdateQuizDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzes.update(quizId, dto, user);
  }

  @Delete('quizzes/:quizId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  remove(@Param('quizId') quizId: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.softDelete(quizId, user);
  }

  @Post('quizzes/:quizId/attempts')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  start(@Param('quizId') quizId: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.startAttempt(quizId, user);
  }

  @Get('quizzes/:quizId/attempts')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  listAttempts(@Param('quizId') quizId: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.listAttempts(quizId, user);
  }

  @Post('attempts/:attemptId/finish')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  finish(
    @Param('attemptId') attemptId: string,
    @Body() dto: FinishAttemptDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzes.finishAttempt(attemptId, dto, user);
  }
}
