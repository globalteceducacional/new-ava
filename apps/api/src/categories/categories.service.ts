import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { softDeleteData } from '../common/soft-delete';
import { slugify } from '../common/slugify';
import { CatalogCacheService } from '../redis/catalog-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async list() {
    const cached = await this.catalogCache.getCategories<unknown[]>();
    if (cached) return cached;

    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { courses: true },
        },
      },
    });
    await this.catalogCache.setCategories(rows);
    return rows;
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    const slug = slugify(dto.name);
    const exists = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null },
    });
    if (exists) {
      throw new ConflictException('Já existe categoria com este nome/slug');
    }

    const created = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        createdBy: actorId,
      },
    });
    await this.catalogCache.invalidateAll();
    return created;
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    await this.requireActive(id);
    const data: {
      name?: string;
      slug?: string;
      description?: string | null;
      updatedBy: string;
    } = { updatedBy: actorId };

    if (dto.name) {
      data.name = dto.name;
      data.slug = slugify(dto.name);
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    const updated = await this.prisma.category.update({ where: { id }, data });
    await this.catalogCache.invalidateAll();
    return updated;
  }

  async softDelete(id: string, actorId: string) {
    await this.requireActive(id);
    const deleted = await this.prisma.category.update({
      where: { id },
      data: softDeleteData(actorId),
    });
    await this.catalogCache.invalidateAll();
    return deleted;
  }

  private async requireActive(id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    return cat;
  }
}
