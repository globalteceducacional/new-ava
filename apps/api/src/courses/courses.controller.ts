import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { AssignTeacherDto, CreateEnrollmentDto } from './dto/relations.dto';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  listCatalog(@CurrentUser() user: AuthUser) {
    return this.courses.listCatalog(user);
  }

  @Get('mine')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR, RoleCode.ALUNO)
  async mine(@CurrentUser() user: AuthUser, @Query('for') forUse?: string) {
    if (user.role === RoleCode.ALUNO) {
      if (forUse === 'community') {
        return this.courses.listMineForCommunity(user.id);
      }
      return this.courses.listMineForStudent(user.id);
    }
    if (user.role === RoleCode.PROFESSOR) {
      return this.courses.listMineForTeacher(user.id);
    }
    // Master: catálogo completo
    return this.courses.listCatalog(user);
  }

  /** Cursos publicados disponíveis para o aluno (opcionais). */
  @Get('available')
  @Roles(RoleCode.ALUNO)
  available(@CurrentUser() user: AuthUser) {
    return this.courses.listAvailableForStudent(user);
  }

  /**
   * Catálogo para vínculo instituição↔curso.
   * ADM_INSTITUICAO precisa ver cursos ainda não vinculados (GET /courses só lista os já linkados).
   */
  @Get('linkable')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  linkable(@CurrentUser() user: AuthUser) {
    return this.courses.listLinkable(user);
  }

  /** Grade curricular: cursos alocados pela instituição/professor. */
  @Get('curriculum')
  @Roles(RoleCode.ALUNO)
  curriculum(@CurrentUser() user: AuthUser) {
    return this.courses.listCurriculumForStudent(user.id);
  }

  /** Indica se o usuário pertence a alguma escola (não só AVA Aberto). */
  @Get('me/has-school')
  @Roles(RoleCode.ALUNO, RoleCode.PROFESSOR)
  hasSchool(@CurrentUser() user: AuthUser) {
    return this.courses
      .studentHasSchool(user)
      .then((hasSchool) => ({ hasSchool }));
  }

  @Get(':id')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.getById(id, user);
  }

  @Post()
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthUser) {
    return this.courses.create(dto, user);
  }

  @Patch(':id')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.softDelete(id, user);
  }

  @Patch(':id/publish')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.publish(id, user);
  }

  @Patch(':id/archive')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.archive(id, user);
  }

  @Patch(':id/unpublish')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.unpublish(id, user);
  }

  @Get(':id/teachers')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  listTeachers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.listTeachers(id, user);
  }

  @Post(':id/teachers')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  assignTeacher(
    @Param('id') id: string,
    @Body() dto: AssignTeacherDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.assignTeacher(id, dto.teacherUserId, user);
  }

  @Delete(':id/teachers/:teacherUserId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  unassignTeacher(
    @Param('id') id: string,
    @Param('teacherUserId') teacherUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.unassignTeacher(id, teacherUserId, user);
  }

  @Get(':id/institutions')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  listInstitutions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.listCourseInstitutions(id, user);
  }

  @Get(':id/enrollments')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  listEnrollments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.listEnrollments(id, user);
  }

  @Post(':id/enrollments/me')
  @Roles(RoleCode.ALUNO)
  enrollSelf(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.courses.enrollSelf(id, user);
  }

  @Post(':id/enrollments')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  enroll(
    @Param('id') id: string,
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.enrollStudent(
      id,
      dto.studentUserId,
      user,
      dto.institutionId,
    );
  }

  @Delete(':id/enrollments/:studentUserId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  removeEnrollment(
    @Param('id') id: string,
    @Param('studentUserId') studentUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.removeEnrollment(id, studentUserId, user);
  }
}
