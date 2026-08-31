import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Média simples: média aritmética de
 * - notas de atividades corrigidas (0–10)
 * - scores de quiz normalizados para 0–10 (score/maxScore*10)
 * Pesos iguais por item; ajustável depois.
 */
@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async myGrades(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    if (user.role === RoleCode.ALUNO) {
      return this.buildReport(courseId, user.id);
    }
    // professor pedindo /me: usa próprio id (sem sentido) — retorna vazio útil
    return this.buildReport(courseId, user.id);
  }

  async courseGrades(courseId: string, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, deletedAt: null, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const rows = [];
    for (const e of enrollments) {
      rows.push({
        student: e.user,
        ...(await this.buildReport(courseId, e.userId)),
      });
    }
    return rows;
  }

  async studentGrade(courseId: string, studentId: string, user: AuthUser) {
    if (user.role === RoleCode.ALUNO && user.id !== studentId) {
      throw new ForbiddenException(
        'Não é permitido ver boletim de outro aluno',
      );
    }
    if (user.role === RoleCode.ALUNO) {
      await this.access.assertCanView(courseId, user);
    } else {
      await this.access.assertCanManage(courseId, user);
    }
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, name: true, email: true },
    });
    if (!student) throw new NotFoundException('Aluno não encontrado');
    return { student, ...(await this.buildReport(courseId, studentId)) };
  }

  private async buildReport(courseId: string, studentId: string) {
    const activities = await this.prisma.activity.findMany({
      where: { courseId, deletedAt: null },
      include: {
        submissions: {
          where: { studentId, deletedAt: null, grade: { not: null } },
        },
      },
    });

    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId, deletedAt: null, graded: true },
      include: {
        attempts: {
          where: {
            studentId,
            deletedAt: null,
            finishedAt: { not: null },
            score: { not: null },
          },
          orderBy: { finishedAt: 'desc' },
          take: 1,
        },
      },
    });

    const items: Array<{
      type: 'ACTIVITY' | 'QUIZ';
      id: string;
      title: string;
      grade10: number | null;
      raw?: number | null;
      max?: number | null;
    }> = [];

    for (const a of activities) {
      const sub = a.submissions[0];
      items.push({
        type: 'ACTIVITY',
        id: a.id,
        title: a.title,
        grade10: sub?.grade ?? null,
      });
    }

    for (const q of quizzes) {
      const att = q.attempts[0];
      const grade10 =
        att?.score != null && att.maxScore && att.maxScore > 0
          ? Math.round((att.score / att.maxScore) * 100) / 10
          : null;
      items.push({
        type: 'QUIZ',
        id: q.id,
        title: q.title,
        grade10,
        raw: att?.score ?? null,
        max: att?.maxScore ?? null,
      });
    }

    const graded = items.filter((i) => i.grade10 != null) as Array<{
      grade10: number;
    }>;
    const average =
      graded.length > 0
        ? Math.round(
            (graded.reduce((s, i) => s + i.grade10, 0) / graded.length) * 10,
          ) / 10
        : null;

    return { items, average, gradedCount: graded.length };
  }
}
