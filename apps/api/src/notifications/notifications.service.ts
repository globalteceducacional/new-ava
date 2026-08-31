import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, NotificationType, RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const AVA_ABERTO_SLUG = 'ava-aberto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Usuário tem vínculo ativo em instituição escolar (exclui AVA Aberto). */
  async userHasSchoolAllocation(userId: string): Promise<boolean> {
    const count = await this.prisma.institutionMember.count({
      where: {
        userId,
        deletedAt: null,
        institution: {
          deletedAt: null,
          NOT: { slug: AVA_ABERTO_SLUG },
        },
      },
    });
    return count > 0;
  }

  async listMine(user: AuthUser, limit = 50) {
    await this.assertNotificationsEnabled(user);
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        courseId: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(user: AuthUser) {
    await this.assertNotificationsEnabled(user);
    const count = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    return { count };
  }

  async markRead(notificationId: string, user: AuthUser) {
    await this.assertNotificationsEnabled(user);
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });
    if (!row) throw new NotFoundException('Notificação não encontrada');
    if (row.readAt) return row;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(user: AuthUser) {
    await this.assertNotificationsEnabled(user);
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async removeOne(notificationId: string, user: AuthUser) {
    await this.assertNotificationsEnabled(user);
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Notificação não encontrada');
    await this.prisma.notification.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async removeAll(user: AuthUser) {
    await this.assertNotificationsEnabled(user);
    const result = await this.prisma.notification.deleteMany({
      where: { userId: user.id },
    });
    return { ok: true, deleted: result.count };
  }

  /**
   * Notifica alunos matriculados no curso que têm alocação institucional.
   * Não notifica o autor da alteração.
   */
  async notifyCourseStudents(params: {
    courseId: string;
    actorId: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string;
  }) {
    const course = await this.prisma.course.findFirst({
      where: { id: params.courseId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!course) return;

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId: params.courseId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        userId: { not: params.actorId },
        user: {
          deletedAt: null,
          role: { code: RoleCode.ALUNO },
          memberships: {
            some: {
              deletedAt: null,
              institution: {
                deletedAt: null,
                NOT: { slug: AVA_ABERTO_SLUG },
              },
            },
          },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    if (!enrollments.length) return;

    const rows = enrollments.map((e) => ({
      userId: e.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      courseId: course.id,
      createdBy: params.actorId,
    }));

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await this.prisma.notification.createMany({
        data: rows.slice(i, i + chunkSize),
      });
    }
  }

  /** Notifica o professor ao ser alocado a um curso (se tiver instituição). */
  async notifyTeacherAssigned(params: {
    courseId: string;
    teacherUserId: string;
    actorId: string;
  }) {
    if (params.teacherUserId === params.actorId) return;
    const eligible = await this.userHasSchoolAllocation(params.teacherUserId);
    if (!eligible) return;

    const course = await this.prisma.course.findFirst({
      where: { id: params.courseId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!course) return;

    await this.prisma.notification.create({
      data: {
        userId: params.teacherUserId,
        type: NotificationType.TEACHER_ASSIGNED,
        title: 'Você foi alocado a um curso',
        body: `Você foi designado como professor do curso "${course.title}".`,
        link: `/professor/editor?courseId=${course.id}`,
        courseId: course.id,
        createdBy: params.actorId,
      },
    });
  }

  async notifyModuleAdded(
    courseId: string,
    moduleTitle: string,
    actorId: string,
  ) {
    const course = await this.courseTitle(courseId);
    if (!course) return;
    await this.notifyCourseStudents({
      courseId,
      actorId,
      type: NotificationType.COURSE_MODULE_ADDED,
      title: 'Novo módulo no curso',
      body: `Foi adicionado o módulo "${moduleTitle}" em "${course}".`,
      link: `/aluno/cursos/${courseId}`,
    });
  }

  async notifyLessonAdded(
    courseId: string,
    lessonTitle: string,
    actorId: string,
  ) {
    const course = await this.courseTitle(courseId);
    if (!course) return;
    await this.notifyCourseStudents({
      courseId,
      actorId,
      type: NotificationType.COURSE_LESSON_ADDED,
      title: 'Nova aula no curso',
      body: `Foi adicionada a aula "${lessonTitle}" em "${course}".`,
      link: `/aluno/cursos/${courseId}`,
    });
  }

  async notifyActivityAdded(
    courseId: string,
    activityTitle: string,
    actorId: string,
  ) {
    const course = await this.courseTitle(courseId);
    if (!course) return;
    await this.notifyCourseStudents({
      courseId,
      actorId,
      type: NotificationType.COURSE_ACTIVITY_ADDED,
      title: 'Nova atividade no curso',
      body: `Foi adicionada a atividade "${activityTitle}" em "${course}".`,
      link: `/aluno/cursos/${courseId}`,
    });
  }

  private async courseTitle(courseId: string): Promise<string | null> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { title: true },
    });
    return course?.title ?? null;
  }

  private async assertNotificationsEnabled(user: AuthUser) {
    const ok = await this.userHasSchoolAllocation(user.id);
    if (!ok) {
      throw new ForbiddenException(
        'Notificações disponíveis apenas para quem tem alocação em instituição',
      );
    }
  }
}
