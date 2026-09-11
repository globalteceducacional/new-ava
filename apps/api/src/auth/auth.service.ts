import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, AuditAction, RoleCode, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';
import { LoginProtectionService } from './login-protection.service';
import {
  generateRawToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './password.util';
import { usernameFromEmail } from './username-from-email';

const REFRESH_COOKIE = 'ava_refresh';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly protection: LoginProtectionService,
  ) {}

  get refreshCookieName(): string {
    return REFRESH_COOKIE;
  }

  hashPassword = hashPassword;
  verifyPassword = verifyPassword;

  async login(
    login: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    await this.protection.assertIpAllowed(meta.ip);
    await this.protection.assertNotLocked(login);

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: login.toLowerCase() }, { username: login.toLowerCase() }],
      },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
        memberships: {
          where: { deletedAt: null },
          select: {
            institutionId: true,
            institution: { select: { slug: true } },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.protection.recordFailure(login);
      await this.audit.record({
        action: AuditAction.LOGIN_FAIL,
        actorId: user?.id ?? null,
        metadata: { reason: 'user_not_found_or_blocked', login, ...meta },
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await this.protection.recordFailure(login);
      await this.audit.record({
        action: AuditAction.LOGIN_FAIL,
        actorId: user.id,
        metadata: { reason: 'bad_password', ...meta },
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.protection.clearFailures(login);

    const authUser = this.toAuthUser(user);
    const accessToken = await this.signAccess(authUser);
    const refreshToken = await this.issueRefresh(user.id, meta);

    await this.audit.record({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      institutionId: authUser.institutionIds[0] ?? null,
      metadata: meta,
    });

    return { accessToken, refreshToken, user: authUser };
  }

  /** Aluno sem escola — catálogo livre (ava-aberto). Papel e instituições não vêm do cliente. */
  async register(
    dto: { name: string; email: string; password: string },
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    await this.protection.assertIpAllowed(meta.ip);

    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();

    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ALUNO },
    });
    const username = await this.allocateUsername(email);
    const passwordHash = await hashPassword(dto.password);

    try {
      const created = await this.prisma.user.create({
        data: {
          name,
          email,
          username,
          passwordHash,
          roleId: role.id,
          status: UserStatus.ACTIVE,
        },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
          memberships: {
            where: { deletedAt: null },
            select: {
              institutionId: true,
              institution: { select: { slug: true } },
            },
          },
        },
      });

      const authUser = this.toAuthUser(created);
      const accessToken = await this.signAccess(authUser);
      const refreshToken = await this.issueRefresh(created.id, meta);

      await this.audit.record({
        action: AuditAction.USER_CREATE,
        actorId: created.id,
        metadata: { selfRegister: true, username, ...meta },
      });

      return { accessToken, refreshToken, user: authUser };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw err;
    }
  }

  async refresh(
    rawToken: string | undefined,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
            memberships: {
              where: { deletedAt: null },
              select: {
                institutionId: true,
                institution: { select: { slug: true } },
              },
            },
          },
        },
      },
    });

    if (
      !stored ||
      stored.user.deletedAt ||
      stored.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Rotação: revoga o atual e emite novo refresh + access.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const authUser = this.toAuthUser(stored.user);
    const accessToken = await this.signAccess(authUser);
    const refreshToken = await this.issueRefresh(stored.userId, meta);

    return { accessToken, refreshToken, user: authUser };
  }

  async logout(rawToken: string | undefined, userId?: string): Promise<void> {
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (userId) {
      await this.audit.record({
        action: AuditAction.LOGOUT,
        actorId: userId,
      });
    }
  }

  async validateUserById(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
        memberships: {
          where: { deletedAt: null },
          select: {
            institutionId: true,
            institution: { select: { slug: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.toAuthUser(user);
  }

  assertInstitutionAccess(user: AuthUser, institutionId: string): void {
    if (user.role === RoleCode.ADM_MASTER) return;
    if (!user.institutionIds.includes(institutionId)) {
      throw new ForbiddenException('Sem acesso a esta instituição');
    }
  }

  /** Username a partir do e-mail; sufixo se já existir (ex.: seed `aluno`). */
  private async allocateUsername(email: string): Promise<string> {
    const base = usernameFromEmail(email);
    for (let i = 0; i < 40; i++) {
      const suffix = i === 0 ? '' : String(i + 1);
      const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `aluno${Date.now().toString(36)}`.slice(0, 32);
  }

  private async signAccess(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.signAsync(payload);
  }

  private async issueRefresh(
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<string> {
    const raw = generateRawToken();
    const days = Number(this.config.get('JWT_REFRESH_DAYS') ?? 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return raw;
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    username: string;
    name: string;
    avatarKey?: string | null;
    role: {
      code: RoleCode;
      rolePermissions: Array<{ permission: { code: string } }>;
    };
    memberships: Array<{
      institutionId: string;
      institution: { slug: string };
    }>;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role.code,
      institutionIds: user.memberships.map((m) => m.institutionId),
      hasSchool: user.memberships.some(
        (m) => m.institution.slug !== 'ava-aberto',
      ),
      hasAvatar: Boolean(user.avatarKey),
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
    };
  }
}
