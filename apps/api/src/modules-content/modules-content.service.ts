import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { withMediaProgress } from '../media/media-progress.store';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateModuleDto,
  CreateModuleVideoDto,
  CreateVideoMaterialDto,
  ReorderIdsDto,
  UpdateModuleDto,
  UpdateModuleVideoDto,
  UpdateVideoMaterialDto,
} from './dto/module.dto';

const videoInclude = {
  materials: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
  },
  mediaAsset: {
    // sizeBytes é BigInt e não é serializável em JSON — exposto via GET /media/:id.
    select: {
      id: true,
      status: true,
      originalFilename: true,
      mimeType: true,
      errorMessage: true,
    },
  },
};

function attachVideoProgress<
  T extends { videos: Array<{ mediaAsset: { id: string } | null }> },
>(mod: T): T {
  return {
    ...mod,
    videos: mod.videos.map((video) => ({
      ...video,
      mediaAsset: withMediaProgress(video.mediaAsset),
    })),
  };
}

@Injectable()
export class ModulesContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    const rows = await this.prisma.courseModule.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        videos: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: videoInclude,
        },
      },
    });
    return rows.map(attachVideoProgress);
  }

  async get(courseId: string, moduleId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    const mod = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, courseId, deletedAt: null },
      include: {
        videos: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: videoInclude,
        },
      },
    });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return attachVideoProgress(mod);
  }

  async createModule(courseId: string, dto: CreateModuleDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const max = await this.prisma.courseModule.aggregate({
      where: { courseId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const mod = await this.prisma.courseModule.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
        createdBy: user.id,
      },
    });
    await this.notifications
      .notifyModuleAdded(courseId, mod.title, user.id)
      .catch(() => undefined);
    return mod;
  }

  async updateModule(
    courseId: string,
    moduleId: string,
    dto: UpdateModuleDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireModule(courseId, moduleId);
    return this.prisma.courseModule.update({
      where: { id: moduleId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        updatedBy: user.id,
      },
    });
  }

  async softDeleteModule(courseId: string, moduleId: string, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    await this.requireModule(courseId, moduleId);
    const stamp = softDeleteData(user.id);
    await this.prisma.$transaction([
      this.prisma.courseModule.update({
        where: { id: moduleId },
        data: stamp,
      }),
      this.prisma.moduleVideo.updateMany({
        where: { moduleId, deletedAt: null },
        data: stamp,
      }),
    ]);
    return { ok: true };
  }

  async reorderModules(courseId: string, dto: ReorderIdsDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const items = await this.prisma.courseModule.findMany({
      where: { courseId, deletedAt: null, id: { in: dto.orderedIds } },
    });
    if (items.length !== dto.orderedIds.length) {
      throw new BadRequestException('Um ou mais módulos são inválidos');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.courseModule.update({
          where: { id },
          data: { sortOrder: index, updatedBy: user.id },
        }),
      ),
    );
    return this.list(courseId, user);
  }

  async addVideo(
    courseId: string,
    moduleId: string,
    dto: CreateModuleVideoDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireModule(courseId, moduleId);
    const max = await this.prisma.moduleVideo.aggregate({
      where: { moduleId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const video = await this.prisma.moduleVideo.create({
      data: {
        moduleId,
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
        createdBy: user.id,
      },
      include: videoInclude,
    });
    await this.notifications
      .notifyLessonAdded(courseId, video.title, user.id)
      .catch(() => undefined);
    return video;
  }

  async updateVideo(
    courseId: string,
    moduleId: string,
    videoId: string,
    dto: UpdateModuleVideoDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireVideo(courseId, moduleId, videoId);
    return this.prisma.moduleVideo.update({
      where: { id: videoId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        updatedBy: user.id,
      },
      include: videoInclude,
    });
  }

  async softDeleteVideo(
    courseId: string,
    moduleId: string,
    videoId: string,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireVideo(courseId, moduleId, videoId);
    const stamp = softDeleteData(user.id);
    await this.prisma.$transaction([
      this.prisma.moduleVideo.update({ where: { id: videoId }, data: stamp }),
      this.prisma.moduleVideoMaterial.updateMany({
        where: { moduleVideoId: videoId, deletedAt: null },
        data: stamp,
      }),
    ]);
    return { ok: true };
  }

  async reorderVideos(
    courseId: string,
    moduleId: string,
    dto: ReorderIdsDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireModule(courseId, moduleId);
    const items = await this.prisma.moduleVideo.findMany({
      where: { moduleId, deletedAt: null, id: { in: dto.orderedIds } },
    });
    if (items.length !== dto.orderedIds.length) {
      throw new BadRequestException('Uma ou mais aulas são inválidas');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.moduleVideo.update({
          where: { id },
          data: { sortOrder: index, updatedBy: user.id },
        }),
      ),
    );
    return this.get(courseId, moduleId, user);
  }

  async addMaterial(
    courseId: string,
    moduleId: string,
    videoId: string,
    dto: CreateVideoMaterialDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireVideo(courseId, moduleId, videoId);

    const max = await this.prisma.moduleVideoMaterial.aggregate({
      where: { moduleVideoId: videoId, deletedAt: null },
      _max: { sortOrder: true },
    });

    return this.prisma.moduleVideoMaterial.create({
      data: {
        moduleVideoId: videoId,
        type: dto.type,
        title: dto.title,
        url: dto.url,
        refId: dto.refId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        createdBy: user.id,
      },
    });
  }

  async updateMaterial(
    courseId: string,
    moduleId: string,
    videoId: string,
    materialId: string,
    dto: UpdateVideoMaterialDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireMaterial(courseId, moduleId, videoId, materialId);
    return this.prisma.moduleVideoMaterial.update({
      where: { id: materialId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.refId !== undefined ? { refId: dto.refId } : {}),
        updatedBy: user.id,
      },
    });
  }

  async softDeleteMaterial(
    courseId: string,
    moduleId: string,
    videoId: string,
    materialId: string,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireMaterial(courseId, moduleId, videoId, materialId);
    return this.prisma.moduleVideoMaterial.update({
      where: { id: materialId },
      data: softDeleteData(user.id),
    });
  }

  private async requireModule(courseId: string, moduleId: string) {
    const mod = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, courseId, deletedAt: null },
    });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return mod;
  }

  private async requireVideo(
    courseId: string,
    moduleId: string,
    videoId: string,
  ) {
    await this.requireModule(courseId, moduleId);
    const video = await this.prisma.moduleVideo.findFirst({
      where: { id: videoId, moduleId, deletedAt: null },
    });
    if (!video) throw new NotFoundException('Aula não encontrada');
    return video;
  }

  private async requireMaterial(
    courseId: string,
    moduleId: string,
    videoId: string,
    materialId: string,
  ) {
    await this.requireVideo(courseId, moduleId, videoId);
    const material = await this.prisma.moduleVideoMaterial.findFirst({
      where: { id: materialId, moduleVideoId: videoId, deletedAt: null },
    });
    if (!material) throw new NotFoundException('Material não encontrado');
    return material;
  }
}
