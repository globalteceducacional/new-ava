import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GradesService } from './grades.service';

@Controller('courses/:courseId/grades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  @Get('me')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  me(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.grades.myGrades(courseId, user);
  }

  @Get()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.grades.courseGrades(courseId, user);
  }

  @Get('students/:studentId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  student(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.grades.studentGrade(courseId, studentId, user);
  }
}
