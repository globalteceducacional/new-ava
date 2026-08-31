import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CourseStatus,
  EnrollmentStatus,
  Prisma,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAuditQueryDto } from './dto/admin.dto';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Indicadores do painel. Master vê tudo; adm de instituição vê o próprio escopo. */
  async overview(actor: AuthUser) {
    const scopeIds =
      actor.role === RoleCode.ADM_MASTER ? null : actor.institutionIds;

    const memberScope: Prisma.UserWhereInput = scopeIds
      ? {
          memberships: {
            some: { deletedAt: null, institutionId: { in: scopeIds } },
          },
        }
      : {};

    const countUsers = (role: RoleCode) =>
      this.prisma.user.count({
        where: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
          role: { code: role },
          ...memberScope,
        },
      });

    const courseWhere: Prisma.CourseWhereInput = scopeIds
      ? {
          deletedAt: null,
          institutions: {
            some: {
              deletedAt: null,
              active: true,
              institutionId: { in: scopeIds },
            },
          },
        }
      : { deletedAt: null };

    const [
      institutions,
      students,
      teachers,
      institutionAdmins,
      totalCourses,
      publishedCourses,
      draftCourses,
      enrollments,
      pendingSubmissions,
      recentLogins,
    ] = await Promise.all([
      this.prisma.institution.count({
        where: {
          deletedAt: null,
          ...(scopeIds ? { id: { in: scopeIds } } : {}),
        },
      }),
      countUsers(RoleCode.ALUNO),
      countUsers(RoleCode.PROFESSOR),
      countUsers(RoleCode.ADM_INSTITUICAO),
      this.prisma.course.count({ where: courseWhere }),
      this.prisma.course.count({
        where: { ...courseWhere, status: CourseStatus.PUBLISHED },
      }),
      this.prisma.course.count({
        where: { ...courseWhere, status: CourseStatus.DRAFT },
      }),
      this.prisma.enrollment.count({
        where: {
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
          ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
        },
      }),
      this.prisma.activitySubmission.count({
        where: {
          deletedAt: null,
          gradedAt: null,
          ...(scopeIds
            ? {
                activity: {
                  course: {
                    institutions: {
                      some: {
                        deletedAt: null,
                        active: true,
                        institutionId: { in: scopeIds },
                      },
                    },
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'LOGIN_SUCCESS',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
        },
      }),
    ]);

    const coursesWithoutTeacher = await this.prisma.course.count({
      where: { ...courseWhere, teachers: { none: { deletedAt: null } } },
    });

    return {
      institutions,
      students,
      teachers,
      institutionAdmins,
      courses: {
        total: totalCourses,
        published: publishedCourses,
        draft: draftCourses,
        withoutTeacher: coursesWithoutTeacher,
      },
      enrollments,
      pendingSubmissions,
      recentLogins,
    };
  }

  async listAudit(query: ListAuditQueryDto, actor: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;

    if (actor.role === RoleCode.ADM_MASTER) {
      if (query.institutionId) where.institutionId = query.institutionId;
    } else {
      if (
        query.institutionId &&
        !actor.institutionIds.includes(query.institutionId)
      ) {
        throw new ForbiddenException('Sem acesso a esta instituição');
      }
      where.institutionId = {
        in: query.institutionId ? [query.institutionId] : actor.institutionIds,
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          actor: { select: { id: true, name: true, username: true } },
          institution: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
