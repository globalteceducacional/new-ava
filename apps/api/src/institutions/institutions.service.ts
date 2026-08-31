import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/slugify';
import { softDeleteData } from '../common/soft-delete';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from './dto/institution.dto';

const institutionSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  _count: {
    select: {
      members: { where: { deletedAt: null } },
      courses: { where: { deletedAt: null, active: true } },
      enrollments: { where: { deletedAt: null } },
    },
  },
  members: {
    where: {
      deletedAt: null,
      role: { code: RoleCode.ADM_INSTITUICAO },
      user: { deletedAt: null },
    },
    select: {
      user: {
        select: { id: true, name: true, username: true, email: true },
      },
    },
    orderBy: { user: { name: 'asc' as const } },
  },
} satisfies Prisma.InstitutionSelect;

type InstitutionRow = Prisma.InstitutionGetPayload<{
  select: typeof institutionSelect;
}>;

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser) {
    const rows = await this.prisma.institution.findMany({
      where: this.scopeWhere(actor),
      orderBy: { name: 'asc' },
      select: institutionSelect,
    });
    return rows.map(serialize);
  }

  async getById(id: string, actor: AuthUser) {
    this.assertScope(actor, id);
    const row = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: institutionSelect,
    });
    if (!row) throw new NotFoundException('Instituição não encontrada');

    const membersByRole = await this.prisma.institutionMember.groupBy({
      by: ['roleId'],
      where: { institutionId: id, deletedAt: null },
      _count: { _all: true },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: membersByRole.map((m) => m.roleId) } },
      select: { id: true, code: true },
    });
    const roleById = new Map(roles.map((r) => [r.id, r.code]));

    return {
      ...serialize(row),
      membersByRole: membersByRole.map((m) => ({
        role: roleById.get(m.roleId) ?? 'UNKNOWN',
        count: m._count._all,
      })),
    };
  }

  async create(dto: CreateInstitutionDto, actor: AuthUser) {
    const slug = await this.uniqueSlug(dto.slug ?? dto.name, {
      explicit: Boolean(dto.slug),
    });

    const created = await this.prisma.institution.create({
      data: {
        name: dto.name,
        slug,
        status: dto.status ?? 'ACTIVE',
        createdBy: actor.id,
      },
      select: institutionSelect,
    });

    await this.audit.record({
      action: AuditAction.INSTITUTION_CREATE,
      actorId: actor.id,
      institutionId: created.id,
      metadata: { name: created.name, slug: created.slug },
    });

    return serialize(created);
  }

  async update(id: string, dto: UpdateInstitutionDto, actor: AuthUser) {
    this.assertScope(actor, id);
    const current = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!current) throw new NotFoundException('Instituição não encontrada');

    // Adm de instituição ajusta apenas o nome; slug/status são do master.
    if (actor.role !== RoleCode.ADM_MASTER) {
      if (dto.slug !== undefined || dto.status !== undefined) {
        throw new ForbiddenException(
          'Somente o administrador master altera slug e status',
        );
      }
    }

    const slug =
      dto.slug && dto.slug !== current.slug
        ? await this.uniqueSlug(dto.slug, { explicit: true, excludeId: id })
        : undefined;

    const updated = await this.prisma.institution.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(slug ? { slug } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedBy: actor.id,
      },
      select: institutionSelect,
    });

    await this.audit.record({
      action: AuditAction.INSTITUTION_UPDATE,
      actorId: actor.id,
      institutionId: id,
      metadata: { changes: Object.keys(dto) },
    });

    return serialize(updated);
  }

  async softDelete(id: string, actor: AuthUser) {
    const institution = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: institutionSelect,
    });
    if (!institution) throw new NotFoundException('Instituição não encontrada');

    if (institution._count.members > 0) {
      throw new BadRequestException(
        'Remova ou transfira os usuários vinculados antes de excluir a instituição',
      );
    }

    const stamp = softDeleteData(actor.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.institution.update({ where: { id }, data: stamp });
      await tx.institutionCourse.updateMany({
        where: { institutionId: id, deletedAt: null },
        data: { ...stamp, active: false },
      });
    });

    await this.audit.record({
      action: AuditAction.INSTITUTION_DELETE,
      actorId: actor.id,
      metadata: { institutionId: id, slug: institution.slug },
    });

    return { ok: true };
  }

  private scopeWhere(actor: AuthUser): Prisma.InstitutionWhereInput {
    if (actor.role === RoleCode.ADM_MASTER) return { deletedAt: null };
    return { deletedAt: null, id: { in: actor.institutionIds } };
  }

  private assertScope(actor: AuthUser, institutionId: string) {
    if (actor.role === RoleCode.ADM_MASTER) return;
    if (!actor.institutionIds.includes(institutionId)) {
      throw new ForbiddenException('Sem acesso a esta instituição');
    }
  }

  /**
   * Slug explícito precisa estar livre (erro 409). Slug derivado do nome
   * recebe sufixo numérico até encontrar um disponível.
   */
  private async uniqueSlug(
    base: string,
    opts: { explicit: boolean; excludeId?: string },
  ) {
    const root = slugify(base) || 'instituicao';
    const isFree = async (candidate: string) =>
      !(await this.prisma.institution.findFirst({
        where: {
          slug: candidate,
          ...(opts.excludeId ? { NOT: { id: opts.excludeId } } : {}),
        },
        select: { id: true },
      }));

    if (opts.explicit) {
      if (await isFree(root)) return root;
      throw new ConflictException('Slug já utilizado por outra instituição');
    }

    for (let i = 1; ; i++) {
      const candidate = i === 1 ? root : `${root}-${i}`;
      if (await isFree(candidate)) return candidate;
    }
  }
}

function serialize(row: InstitutionRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    memberCount: row._count.members,
    courseCount: row._count.courses,
    enrollmentCount: row._count.enrollments,
    createdAt: row.createdAt,
    /** Logins ADM_INSTITUICAO vinculados (ex.: usuário `instituição`). */
    admins: row.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      email: m.user.email,
    })),
  };
}
