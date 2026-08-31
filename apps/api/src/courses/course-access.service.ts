import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseStatus, EnrollmentStatus, RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const OPEN_CATALOG_SLUG = 'ava-aberto';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    return course;
  }

  /** Master / professor atribuído / adm instituição com vínculo ativo. */
  async assertCanManage(courseId: string, user: AuthUser): Promise<void> {
    await this.requireCourse(courseId);
    if (user.role === RoleCode.ADM_MASTER) return;

    if (user.role === RoleCode.PROFESSOR) {
      const assigned = await this.prisma.courseTeacher.findFirst({
        where: { courseId, userId: user.id, deletedAt: null },
      });
      if (assigned) return;
      throw new ForbiddenException('Você não está atribuído a este curso');
    }

    if (user.role === RoleCode.ADM_INSTITUICAO) {
      const link = await this.prisma.institutionCourse.findFirst({
        where: {
          courseId,
          active: true,
          deletedAt: null,
          institutionId: { in: user.institutionIds },
        },
      });
      if (link) return;
      throw new ForbiddenException('Curso não vinculado à sua instituição');
    }

    throw new ForbiddenException('Sem permissão para gerenciar este curso');
  }

  /**
   * Aluno: curso publicado no catálogo da escola (ou catálogo livre) —
   * não precisa se matricular para assistir. Matrícula ASSIGNED cobre a grade.
   */
  async assertCanView(courseId: string, user: AuthUser): Promise<void> {
    const course = await this.requireCourse(courseId);
    if (user.role === RoleCode.ADM_MASTER) return;

    if (user.role === RoleCode.ALUNO) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          courseId,
          userId: user.id,
          status: EnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (enrollment) return;

      if (course.status !== CourseStatus.PUBLISHED) {
        throw new ForbiddenException('Curso não disponível');
      }

      const schoolIds = await this.schoolInstitutionIds(user);
      if (!schoolIds.length) {
        // Sem escola (órfão ou só AVA Aberto): catálogo livre — só aba "Cursos".
        return;
      }

      const linked = await this.prisma.institutionCourse.findFirst({
        where: {
          courseId,
          institutionId: { in: schoolIds },
          active: true,
          deletedAt: null,
        },
      });
      if (linked) return;

      throw new ForbiddenException(
        'Curso não disponível para a sua instituição',
      );
    }

    await this.assertCanManage(courseId, user);
  }

  /** Instituições escolares (exclui AVA Aberto). */
  private async schoolInstitutionIds(user: AuthUser): Promise<string[]> {
    const ids = user.institutionIds;
    if (!ids.length) return [];
    const schools = await this.prisma.institution.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        NOT: { slug: OPEN_CATALOG_SLUG },
      },
      select: { id: true },
    });
    return schools.map((s) => s.id);
  }

  /** Entrega/atividade/comunidade: exige alocação (matrícula ativa). */
  async assertEnrolled(courseId: string, userId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        userId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!enrollment) {
      throw new ForbiddenException('Matrícula ativa necessária');
    }
  }
}
