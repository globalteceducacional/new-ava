import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateContentItemDto,
  ReorderContentItemsDto,
  UpdateContentItemDto,
} from './dto/content-item.dto';

@Injectable()
export class ContentItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async list(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    return this.prisma.contentItem.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(courseId: string, dto: CreateContentItemDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const max = await this.prisma.contentItem.aggregate({
      where: { courseId, deletedAt: null },
      _max: { sortOrder: true },
    });
    return this.prisma.contentItem.create({
      data: {
        courseId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        url: dto.url,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
        createdBy: user.id,
      },
    });
  }

  async update(
    courseId: string,
    itemId: string,
    dto: UpdateContentItemDto,
    user: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, user);
    await this.requireItem(courseId, itemId);
    return this.prisma.contentItem.update({
      where: { id: itemId },
      data: { ...dto, updatedBy: user.id },
    });
  }

  async softDelete(courseId: string, itemId: string, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    await this.requireItem(courseId, itemId);
    return this.prisma.contentItem.update({
      where: { id: itemId },
      data: softDeleteData(user.id),
    });
  }

  async reorder(courseId: string, dto: ReorderContentItemsDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const items = await this.prisma.contentItem.findMany({
      where: { courseId, deletedAt: null, id: { in: dto.orderedIds } },
    });
    if (items.length !== dto.orderedIds.length) {
      throw new NotFoundException('Um ou mais itens inválidos para reordenar');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.contentItem.update({
          where: { id },
          data: { sortOrder: index, updatedBy: user.id },
        }),
      ),
    );

    return this.list(courseId, user);
  }

  private async requireItem(courseId: string, itemId: string) {
    const item = await this.prisma.contentItem.findFirst({
      where: { id: itemId, courseId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Item de conteúdo não encontrado');
    return item;
  }
}
