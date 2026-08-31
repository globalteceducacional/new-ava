import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CourseAccessService } from '../courses/course-access.service';
import { resolveHlsDurationSec } from './hls-duration';
import { withMediaProgress } from './media-progress.store';
import { MinioService } from './minio.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModuleVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly minio: MinioService,
  ) {}

  /** Detalhe da aula + playlist do curso (módulos) + anterior/próximo no módulo. */
  async getLesson(videoId: string, user: AuthUser) {
    const video = await this.prisma.moduleVideo.findFirst({
      where: { id: videoId, deletedAt: null },
      include: {
        materials: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
        mediaAsset: {
          select: {
            id: true,
            status: true,
            errorMessage: true,
            originalFilename: true,
          },
        },
        module: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: { select: { id: true, title: true, synopsis: true } },
            videos: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                sortOrder: true,
                mediaAsset: {
                  select: { id: true, status: true, hlsPrefix: true },
                },
                materials: {
                  where: { deletedAt: null },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!video) throw new NotFoundException('Aula não encontrada');
    await this.access.assertCanView(video.module.courseId, user);

    const mapPlaylistItem = (v: {
      id: string;
      title: string;
      sortOrder: number;
      mediaAsset: {
        id: string;
        status: string;
        hlsPrefix?: string | null;
        progressPercent?: number;
      } | null;
      materials: { id: string }[];
    }) => ({
      id: v.id,
      title: v.title,
      sortOrder: v.sortOrder,
      mediaAsset: withMediaProgress(v.mediaAsset),
      hlsPrefix: v.mediaAsset?.hlsPrefix ?? null,
      materialCount: v.materials.length,
      durationSec: null as number | null,
    });

    const playlist = video.module.videos.map(mapPlaylistItem);
    const idx = playlist.findIndex((v) => v.id === video.id);
    const prev = idx > 0 ? playlist[idx - 1] : null;
    const next =
      idx >= 0 && idx < playlist.length - 1 ? playlist[idx + 1] : null;

    // Todos os módulos do curso (playlist lateral com % por módulo).
    const courseModulesRaw = await this.prisma.courseModule.findMany({
      where: { courseId: video.module.courseId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        videos: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            sortOrder: true,
            mediaAsset: {
              select: { id: true, status: true, hlsPrefix: true },
            },
            materials: {
              where: { deletedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });

    const courseModules = courseModulesRaw.map((mod) => ({
      id: mod.id,
      title: mod.title,
      sortOrder: mod.sortOrder,
      videos: mod.videos.map(mapPlaylistItem),
    }));

    const moduleTitleById = new Map(
      courseModulesRaw.map((mod) => [mod.id, mod.title]),
    );

    const [activitiesRaw, quizzesRaw] = await Promise.all([
      this.prisma.activity.findMany({
        where: { courseId: video.module.courseId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          moduleId: true,
          dueDate: true,
        },
      }),
      this.prisma.quiz.findMany({
        where: { courseId: video.module.courseId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          moduleId: true,
        },
      }),
    ]);

    const allPlaylistItems = [
      ...playlist,
      ...courseModules.flatMap((mod) => mod.videos),
    ];
    const durationByPrefix = await this.loadDurations(
      allPlaylistItems.map((item) => item.hlsPrefix),
    );
    const applyDuration = <
      T extends { hlsPrefix: string | null; durationSec: number | null },
    >(
      item: T,
    ) => {
      const { hlsPrefix, ...rest } = item;
      return {
        ...rest,
        durationSec: hlsPrefix
          ? (durationByPrefix.get(hlsPrefix) ?? null)
          : null,
      };
    };
    const playlistWithDuration = playlist.map(applyDuration);
    const courseModulesWithDuration = courseModules.map((mod) => ({
      ...mod,
      videos: mod.videos.map(applyDuration),
    }));

    const activities = [
      ...activitiesRaw.map((item) => ({
        id: item.id,
        title: item.title,
        kind: 'ACTIVITY' as const,
        moduleId: item.moduleId,
        moduleTitle: item.moduleId
          ? (moduleTitleById.get(item.moduleId) ?? null)
          : null,
        dueDate: item.dueDate,
      })),
      ...quizzesRaw.map((item) => ({
        id: item.id,
        title: item.title,
        kind: 'QUIZ' as const,
        moduleId: item.moduleId,
        moduleTitle: item.moduleId
          ? (moduleTitleById.get(item.moduleId) ?? null)
          : null,
        dueDate: null as Date | null,
      })),
    ];

    return {
      id: video.id,
      title: video.title,
      description: video.description,
      sortOrder: video.sortOrder,
      materials: video.materials,
      mediaAsset: withMediaProgress(video.mediaAsset),
      module: {
        id: video.module.id,
        title: video.module.title,
      },
      course: video.module.course,
      playlist: playlistWithDuration,
      courseModules: courseModulesWithDuration,
      activities,
      prev,
      next,
    };
  }

  private async loadDurations(prefixes: Array<string | null>) {
    const unique = [
      ...new Set(prefixes.filter((p): p is string => Boolean(p))),
    ];
    const pairs = await Promise.all(
      unique.map(
        async (prefix) =>
          [prefix, await resolveHlsDurationSec(this.minio, prefix)] as const,
      ),
    );
    return new Map(pairs);
  }
}
