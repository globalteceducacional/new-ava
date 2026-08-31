import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CertificatesService } from '../certificates/certificates.service';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';

/** Mesma regra do front: 90% do vídeo conta como assistido. */
export const WATCHED_RATIO = 0.9;

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    @Inject(forwardRef(() => CertificatesService))
    private readonly certificates: CertificatesService,
  ) {}

  async reportVideoProgress(
    moduleVideoId: string,
    user: AuthUser,
    currentTime: number,
    duration: number,
  ) {
    if (
      !Number.isFinite(currentTime) ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new BadRequestException('currentTime/duration inválidos');
    }

    const video = await this.prisma.moduleVideo.findFirst({
      where: { id: moduleVideoId, deletedAt: null },
      select: {
        id: true,
        moduleId: true,
        module: { select: { courseId: true } },
      },
    });
    if (!video) throw new NotFoundException('Aula não encontrada');

    const courseId = video.module.courseId;
    await this.access.assertCanView(courseId, user);

    const complete = currentTime / duration >= WATCHED_RATIO;
    const position = Math.max(0, Math.min(currentTime, duration));

    const existing = await this.prisma.lessonProgress.findUnique({
      where: {
        userId_moduleVideoId: {
          userId: user.id,
          moduleVideoId,
        },
      },
    });

    const row = await this.prisma.lessonProgress.upsert({
      where: {
        userId_moduleVideoId: {
          userId: user.id,
          moduleVideoId,
        },
      },
      create: {
        userId: user.id,
        moduleVideoId,
        courseId,
        lastPositionSec: position,
        completedAt: complete ? new Date() : null,
      },
      update: {
        lastPositionSec: position,
        ...(complete && !existing?.completedAt
          ? { completedAt: new Date() }
          : {}),
      },
    });

    let courseCompleted = false;
    if (row.completedAt) {
      courseCompleted = await this.tryMarkCourseCompleted(courseId, user.id);
      const cert = await this.certificates
        .issueIfEligible(courseId, user.id)
        .catch(() => null);
      if (cert) courseCompleted = true;
    }

    return {
      moduleVideoId,
      courseId,
      moduleId: video.moduleId,
      completed: Boolean(row.completedAt),
      completedAt: row.completedAt,
      lastPositionSec: row.lastPositionSec,
      courseCompleted,
    };
  }

  async getCourseProgress(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);

    const [videos, progress] = await Promise.all([
      this.prisma.moduleVideo.findMany({
        where: {
          deletedAt: null,
          module: { courseId, deletedAt: null },
        },
        select: { id: true, moduleId: true },
        orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId: user.id, courseId },
        select: {
          moduleVideoId: true,
          completedAt: true,
          lastPositionSec: true,
        },
      }),
    ]);

    const byVideo = new Map(progress.map((p) => [p.moduleVideoId, p]));
    const watchedVideoIds = progress
      .filter((p) => p.completedAt)
      .map((p) => p.moduleVideoId);

    const byModule: Record<string, string[]> = {};
    for (const v of videos) {
      if (!byModule[v.moduleId]) byModule[v.moduleId] = [];
      if (byVideo.get(v.id)?.completedAt) {
        byModule[v.moduleId].push(v.id);
      }
    }

    const total = videos.length;
    const watched = watchedVideoIds.length;
    const percent = total === 0 ? 0 : Math.round((watched / total) * 100);

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        userId: user.id,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
      },
      select: { completedAt: true },
      orderBy: { enrolledAt: 'asc' },
    });

    return {
      courseId,
      watchedVideoIds,
      byModule,
      totalLessons: total,
      watchedLessons: watched,
      percent,
      courseCompletedAt: enrollment?.completedAt ?? null,
    };
  }

  /**
   * Importa IDs já marcados no localStorage (migração única do cliente).
   * Só marca como concluídas; não altera posição.
   */
  async importWatched(courseId: string, user: AuthUser, videoIds: string[]) {
    await this.access.assertCanView(courseId, user);
    const unique = [...new Set(videoIds.filter(Boolean))];
    if (!unique.length) {
      return this.getCourseProgress(courseId, user);
    }

    const videos = await this.prisma.moduleVideo.findMany({
      where: {
        id: { in: unique },
        deletedAt: null,
        module: { courseId, deletedAt: null },
      },
      select: { id: true },
    });
    const validIds = new Set(videos.map((v) => v.id));
    const now = new Date();

    await this.prisma.$transaction(
      [...validIds].map((moduleVideoId) =>
        this.prisma.lessonProgress.upsert({
          where: {
            userId_moduleVideoId: { userId: user.id, moduleVideoId },
          },
          create: {
            userId: user.id,
            moduleVideoId,
            courseId,
            lastPositionSec: 0,
            completedAt: now,
          },
          update: {
            completedAt: now,
          },
        }),
      ),
    );

    const marked = await this.tryMarkCourseCompleted(courseId, user.id);
    if (marked) {
      await this.certificates
        .issueIfEligible(courseId, user.id)
        .catch(() => undefined);
    }
    return this.getCourseProgress(courseId, user);
  }

  private async tryMarkCourseCompleted(
    courseId: string,
    userId: string,
  ): Promise<boolean> {
    const [total, watched] = await Promise.all([
      this.prisma.moduleVideo.count({
        where: {
          deletedAt: null,
          module: { courseId, deletedAt: null },
        },
      }),
      this.prisma.lessonProgress.count({
        where: {
          userId,
          courseId,
          completedAt: { not: null },
        },
      }),
    ]);

    if (total === 0 || watched < total) return false;

    const result = await this.prisma.enrollment.updateMany({
      where: {
        courseId,
        userId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      },
      data: { completedAt: new Date() },
    });

    return result.count > 0;
  }
}
