import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, RoleCode, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import type { AuthUser } from '../auth/auth.types';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { AuditService } from '../audit/audit.service';
import { softDeleteData } from '../common/soft-delete';
import { MinioService } from '../media/minio.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeOwnPasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateSelfDto,
  UpdateUserDto,
} from './dto/user.dto';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AVATAR_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  status: true,
  avatarKey: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { code: true, name: true } },
  memberships: {
    where: { deletedAt: null },
    select: {
      institution: { select: { id: true, name: true, slug: true } },
    },
  },
  _count: {
    select: {
      enrollments: { where: { deletedAt: null } },
      courseTeachers: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export type SerializedUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  status: UserStatus;
  role: RoleCode;
  roleName: string;
  hasAvatar: boolean;
  institutions: Array<{ id: string; name: string; slug: string }>;
  enrollmentCount: number;
  teachingCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly minio: MinioService,
  ) {}

  async list(query: ListUsersQueryDto, actor: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) where.role = { code: query.role };
    if (query.status) where.status = query.status;

    // Adm de instituição só enxerga usuários das próprias instituições.
    const scopedInstitutionIds = this.resolveScopeFilter(
      actor,
      query.institutionId,
    );
    if (scopedInstitutionIds) {
      where.memberships = {
        some: { deletedAt: null, institutionId: { in: scopedInstitutionIds } },
      };
    }

    if (query.q) {
      const q = query.q;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(serialize),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string, actor: AuthUser): Promise<SerializedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanReach(user, actor);
    return serialize(user);
  }

  /** Perfil do usuário autenticado (qualquer papel). */
  async getSelf(actor: AuthUser): Promise<SerializedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return serialize(user);
  }

  /** Atualiza nome/e-mail/username da própria conta. */
  async updateSelf(
    actor: AuthUser,
    dto: UpdateSelfDto,
  ): Promise<SerializedUser> {
    if (
      dto.name === undefined &&
      dto.email === undefined &&
      dto.username === undefined
    ) {
      throw new BadRequestException('Nenhum campo para atualizar');
    }

    await this.assertUniqueIdentity(dto.email, dto.username, actor.id);

    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        updatedBy: actor.id,
      },
      select: userSelect,
    });

    await this.audit.record({
      action: AuditAction.USER_UPDATE,
      actorId: actor.id,
      metadata: { userId: actor.id, self: true, changes: Object.keys(dto) },
    });

    return serialize(updated);
  }

  /** Upload de foto de perfil (JPEG/PNG/WebP, máx. 5 MB). */
  async uploadAvatar(
    actor: AuthUser,
    file: Express.Multer.File | undefined,
  ): Promise<SerializedUser> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo de imagem obrigatório');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Imagem deve ter no máximo 5 MB');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!AVATAR_MIMES.has(mime)) {
      throw new BadRequestException('Use JPEG, PNG ou WebP');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, deletedAt: null },
      select: { id: true, avatarKey: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const ext =
      AVATAR_EXT[mime] ??
      (extname(file.originalname || '').toLowerCase() || '.jpg');
    const key = `avatars/${actor.id}/${randomUUID()}${ext}`;

    await this.minio.putObject(key, file.buffer, mime, file.size);

    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: { avatarKey: key, updatedBy: actor.id },
      select: userSelect,
    });

    if (user.avatarKey && user.avatarKey !== key) {
      try {
        await this.minio.deleteObject(user.avatarKey);
      } catch {
        /* ignore órfão */
      }
    }

    await this.audit.record({
      action: AuditAction.USER_UPDATE,
      actorId: actor.id,
      metadata: { userId: actor.id, self: true, avatar: true },
    });

    return serialize(updated);
  }

  async removeAvatar(actor: AuthUser): Promise<SerializedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, deletedAt: null },
      select: { id: true, avatarKey: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.avatarKey) {
      throw new BadRequestException('Nenhuma foto de perfil para remover');
    }

    const key = user.avatarKey;
    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: { avatarKey: null, updatedBy: actor.id },
      select: userSelect,
    });

    try {
      await this.minio.deleteObject(key);
    } catch {
      /* ignore */
    }

    return serialize(updated);
  }

  /** Stream da foto pública (qualquer usuário ativo com avatar). */
  async streamAvatar(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE },
      select: { avatarKey: true },
    });
    if (!user?.avatarKey) throw new NotFoundException('Foto não encontrada');
    const obj = await this.minio.getObjectStream(user.avatarKey);
    return {
      body: obj.body,
      contentType: obj.contentType ?? 'image/jpeg',
    };
  }

  /** Troca a senha da própria conta e invalida sessões ativas. */
  async changeOwnPassword(actor: AuthUser, dto: ChangeOwnPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const valid = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new BadRequestException('Senha atual incorreta');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual',
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash, updatedBy: actor.id },
      });
      await tx.refreshToken.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      action: AuditAction.USER_PASSWORD_RESET,
      actorId: actor.id,
      metadata: { userId: actor.id, self: true },
    });

    return { ok: true };
  }

  async create(dto: CreateUserDto, actor: AuthUser): Promise<SerializedUser> {
    this.assertCanManageRole(dto.role, actor);

    const institutionIds = await this.normalizeInstitutionIds(
      dto.role,
      dto.institutionIds,
      actor,
    );

    await this.assertUniqueIdentity(dto.email, dto.username);

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { code: dto.role },
    });
    const passwordHash = await hashPassword(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          username: dto.username,
          passwordHash,
          roleId: role.id,
          status: UserStatus.ACTIVE,
          createdBy: actor.id,
        },
      });

      for (const institutionId of institutionIds) {
        await tx.institutionMember.create({
          data: {
            userId: user.id,
            institutionId,
            roleId: role.id,
            createdBy: actor.id,
          },
        });
      }

      return tx.user.findFirstOrThrow({
        where: { id: user.id },
        select: userSelect,
      });
    });

    await this.audit.record({
      action: AuditAction.USER_CREATE,
      actorId: actor.id,
      institutionId: institutionIds[0] ?? null,
      metadata: {
        userId: created.id,
        username: created.username,
        role: dto.role,
      },
    });

    return serialize(created);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthUser,
  ): Promise<SerializedUser> {
    const current = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');
    this.assertCanReach(current, actor);
    this.assertCanManageRole(current.role.code, actor);

    const nextRole = dto.role ?? current.role.code;
    if (dto.role && dto.role !== current.role.code) {
      this.assertCanManageRole(dto.role, actor);
      if (current.id === actor.id) {
        throw new BadRequestException(
          'Não é possível alterar o próprio papel de acesso',
        );
      }
    }

    if (dto.status === UserStatus.BLOCKED && current.id === actor.id) {
      throw new BadRequestException('Não é possível bloquear a própria conta');
    }

    await this.assertUniqueIdentity(dto.email, dto.username, id);

    const institutionIds =
      dto.institutionIds !== undefined || dto.role !== undefined
        ? await this.normalizeInstitutionIds(
            nextRole,
            dto.institutionIds ??
              current.memberships.map((m) => m.institution.id),
            actor,
          )
        : null;

    const role =
      dto.role && dto.role !== current.role.code
        ? await this.prisma.role.findUniqueOrThrow({
            where: { code: dto.role },
          })
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.username !== undefined ? { username: dto.username } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(role ? { roleId: role.id } : {}),
          updatedBy: actor.id,
        },
      });

      if (institutionIds) {
        await this.syncMemberships(tx, id, nextRole, institutionIds, actor);
      }

      return tx.user.findFirstOrThrow({ where: { id }, select: userSelect });
    });

    await this.audit.record({
      action: AuditAction.USER_UPDATE,
      actorId: actor.id,
      metadata: { userId: id, changes: Object.keys(dto) },
    });

    return serialize(updated);
  }

  async resetPassword(id: string, password: string, actor: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanReach(user, actor);
    this.assertCanManageRole(user.role.code, actor);

    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, updatedBy: actor.id },
      });
      // Invalida sessões ativas do usuário.
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      action: AuditAction.USER_PASSWORD_RESET,
      actorId: actor.id,
      metadata: { userId: id },
    });

    return { ok: true };
  }

  async softDelete(id: string, actor: AuthUser) {
    if (id === actor.id) {
      throw new BadRequestException('Não é possível excluir a própria conta');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    this.assertCanReach(user, actor);
    this.assertCanManageRole(user.role.code, actor);

    if (user.role.code === RoleCode.ADM_MASTER) {
      const remaining = await this.prisma.user.count({
        where: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
          role: { code: RoleCode.ADM_MASTER },
          NOT: { id },
        },
      });
      if (remaining === 0) {
        throw new BadRequestException(
          'É necessário manter ao menos um administrador master ativo',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const stamp = softDeleteData(actor.id);
      await tx.user.update({ where: { id }, data: stamp });
      await tx.institutionMember.updateMany({
        where: { userId: id, deletedAt: null },
        data: stamp,
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      action: AuditAction.USER_DELETE,
      actorId: actor.id,
      metadata: { userId: id, username: user.username },
    });

    return { ok: true };
  }

  /** Lista enxuta para selects (atribuir professor, matricular aluno). */
  async lookup(
    role: RoleCode,
    institutionId: string | undefined,
    actor: AuthUser,
  ) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      role: { code: role },
    };

    const scoped = this.resolveScopeFilter(actor, institutionId);
    if (scoped) {
      where.memberships = {
        some: { deletedAt: null, institutionId: { in: scoped } },
      };
    }

    return this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, username: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  private async syncMemberships(
    tx: Prisma.TransactionClient,
    userId: string,
    roleCode: RoleCode,
    institutionIds: string[],
    actor: AuthUser,
  ) {
    const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode } });

    // Adm de instituição só remove vínculos das instituições que administra.
    const conditions: Prisma.InstitutionMemberWhereInput[] = [];
    if (institutionIds.length) {
      conditions.push({ institutionId: { notIn: institutionIds } });
    }
    if (actor.role !== RoleCode.ADM_MASTER) {
      conditions.push({ institutionId: { in: actor.institutionIds } });
    }

    await tx.institutionMember.updateMany({
      where: {
        userId,
        deletedAt: null,
        ...(conditions.length ? { AND: conditions } : {}),
      },
      data: softDeleteData(actor.id),
    });

    for (const institutionId of institutionIds) {
      await tx.institutionMember.upsert({
        where: { userId_institutionId: { userId, institutionId } },
        create: { userId, institutionId, roleId: role.id, createdBy: actor.id },
        update: {
          roleId: role.id,
          deletedAt: null,
          deletedBy: null,
          updatedBy: actor.id,
        },
      });
    }
  }

  private async normalizeInstitutionIds(
    role: RoleCode,
    requested: string[] | undefined,
    actor: AuthUser,
  ): Promise<string[]> {
    const ids = Array.from(new Set(requested ?? []));

    if (role === RoleCode.ADM_MASTER) {
      // Master é global: ignora vínculos institucionais.
      return [];
    }

    if (actor.role === RoleCode.ADM_INSTITUICAO) {
      const outside = ids.filter((id) => !actor.institutionIds.includes(id));
      if (outside.length) {
        throw new ForbiddenException(
          'Sem acesso a uma das instituições informadas',
        );
      }
      if (!ids.length) {
        return actor.institutionIds.slice(0, 1);
      }
    }

    if (!ids.length) {
      throw new BadRequestException(
        'Informe ao menos uma instituição para este papel',
      );
    }

    const found = await this.prisma.institution.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Uma ou mais instituições são inválidas');
    }

    return ids;
  }

  private async assertUniqueIdentity(
    email?: string,
    username?: string,
    excludeId?: string,
  ) {
    const or: Prisma.UserWhereInput[] = [];
    if (email) or.push({ email });
    if (username) or.push({ username });
    if (!or.length) return;

    const clash = await this.prisma.user.findFirst({
      where: {
        OR: or,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { email: true, username: true },
    });
    if (!clash) return;

    throw new ConflictException(
      clash.email === email ? 'E-mail já cadastrado' : 'Username já cadastrado',
    );
  }

  private assertCanManageRole(role: RoleCode, actor: AuthUser) {
    if (actor.role === RoleCode.ADM_MASTER) return;
    if (actor.role !== RoleCode.ADM_INSTITUICAO) {
      throw new ForbiddenException('Sem permissão para gerenciar usuários');
    }
    // Adm de instituição gerencia apenas professores e alunos.
    if (role !== RoleCode.PROFESSOR && role !== RoleCode.ALUNO) {
      throw new ForbiddenException(
        'Administradores de instituição só gerenciam professores e alunos',
      );
    }
  }

  private assertCanReach(user: UserRow, actor: AuthUser) {
    if (actor.role === RoleCode.ADM_MASTER) return;
    const shares = user.memberships.some((m) =>
      actor.institutionIds.includes(m.institution.id),
    );
    if (!shares) throw new NotFoundException('Usuário não encontrado');
  }

  /** null = sem filtro (master sem institutionId na query). */
  private resolveScopeFilter(
    actor: AuthUser,
    institutionId?: string,
  ): string[] | null {
    if (actor.role === RoleCode.ADM_MASTER) {
      return institutionId ? [institutionId] : null;
    }
    if (institutionId) {
      if (!actor.institutionIds.includes(institutionId)) {
        throw new ForbiddenException('Sem acesso a esta instituição');
      }
      return [institutionId];
    }
    return actor.institutionIds.length ? actor.institutionIds : ['__none__'];
  }
}

function serialize(user: UserRow): SerializedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    status: user.status,
    role: user.role.code,
    roleName: user.role.name,
    hasAvatar: Boolean(user.avatarKey),
    institutions: user.memberships.map((m) => m.institution),
    enrollmentCount: user._count.enrollments,
    teachingCount: user._count.courseTeachers,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
