import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CourseStatus,
  EnrollmentSource,
  EnrollmentStatus,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { softDeleteData } from '../common/soft-delete';
import { slugify } from '../common/slugify';
import { NotificationsService } from '../notifications/notifications.service';
import { CatalogCacheService } from '../redis/catalog-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from './course-access.service';
import type { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

const courseInclude = {
  categories: { include: { category: true } },
  teachers: {
    where: { deletedAt: null },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;

const modulesWithVideosInclude = {
  modules: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      videos: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' as const },
        select: { id: true },
      },
    },
  },
} as const;

function firstVideoId(
  modules: Array<{ videos: Array<{ id: string }> }>,
): string | null {
  for (const mod of modules) {
    if (mod.videos[0]) return mod.videos[0].id;
  }
  return null;
}

function lessonCount(
  modules: Array<{ videos: Array<{ id: string }> }>,
): number {
  return modules.reduce((n, m) => n + m.videos.length, 0);
}

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly access: CourseAccessService,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async listCatalog(user: AuthUser) {
    const cached = await this.catalogCache.getCatalog<unknown[]>(user);
    if (cached) return cached;

    const rows = await this.loadCatalog(user);
    await this.catalogCache.setCatalog(user, rows);
    return rows;
  }

  private async loadCatalog(user: AuthUser) {
    if (user.role === RoleCode.ADM_MASTER) {
      return this.prisma.course.findMany({
        where: { deletedAt: null },
        orderBy: { title: 'asc' },
        include: courseInclude,
      });
    }

    if (user.role === RoleCode.ADM_INSTITUICAO) {
      return this.prisma.course.findMany({
        where: {
          deletedAt: null,
          institutions: {
            some: {
              active: true,
              deletedAt: null,
              institutionId: { in: user.institutionIds },
            },
          },
        },
        orderBy: { title: 'asc' },
        include: courseInclude,
      });
    }

    if (user.role === RoleCode.PROFESSOR) {
      return this.prisma.course.findMany({
        where: {
          deletedAt: null,
          teachers: { some: { userId: user.id, deletedAt: null } },
        },
        orderBy: { title: 'asc' },
        include: courseInclude,
      });
    }

    throw new ForbiddenException('Sem permissão para listar o catálogo');
  }

  /**
   * Cursos que a instituição pode vincular (publicado/rascunho do catálogo global).
   * Independente do vínculo atual — o front cruza com /institutions/:id/courses.
   */
  async listLinkable(user: AuthUser) {
    if (
      user.role !== RoleCode.ADM_MASTER &&
      user.role !== RoleCode.ADM_INSTITUICAO
    ) {
      throw new ForbiddenException(
        'Sem permissão para listar cursos vinculáveis',
      );
    }
    return this.prisma.course.findMany({
      where: {
        deletedAt: null,
        status: { in: [CourseStatus.PUBLISHED, CourseStatus.DRAFT] },
      },
      orderBy: { title: 'asc' },
      include: courseInclude,
    });
  }

  async getById(id: string, user: AuthUser) {
    await this.access.assertCanView(id, user);
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: courseInclude,
    });
    if (!course) throw new NotFoundException('Curso não encontrado');

    const { coverKey, ...rest } = course;
    const withCover = { ...rest, hasCustomCover: Boolean(coverKey) };

    // Aluno não precisa de e-mail dos professores.
    if (user.role === RoleCode.ALUNO) {
      return {
        ...withCover,
        teachers: course.teachers.map((t) => ({
          ...t,
          user: {
            id: t.user.id,
            name: t.user.name,
            email: null as string | null,
          },
        })),
      };
    }

    return withCover;
  }

  async create(dto: CreateCourseDto, user: AuthUser) {
    await this.assertCategoriesExist(dto.categoryIds);
    const slug = await this.uniqueSlug(dto.title);

    const created = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          title: dto.title,
          slug,
          synopsis: dto.synopsis,
          workloadHours: Math.max(0, Math.floor(dto.workloadHours ?? 0)),
          status: CourseStatus.DRAFT,
          createdBy: user.id,
          categories: {
            create: dto.categoryIds.map((categoryId) => ({ categoryId })),
          },
        },
        include: courseInclude,
      });

      if (user.role === RoleCode.PROFESSOR) {
        await tx.courseTeacher.create({
          data: { courseId: course.id, userId: user.id, createdBy: user.id },
        });
      }

      return tx.course.findFirstOrThrow({
        where: { id: course.id },
        include: courseInclude,
      });
    });

    await this.audit.record({
      action: AuditAction.COURSE_CREATE,
      actorId: user.id,
      metadata: { courseId: created.id, title: created.title },
    });
    await this.catalogCache.invalidateAll();

    return created;
  }

  async update(id: string, dto: UpdateCourseDto, user: AuthUser) {
    const course = await this.requireEditable(id, user);

    if (dto.categoryIds) {
      await this.assertCategoriesExist(dto.categoryIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: {
        title?: string;
        slug?: string;
        synopsis?: string | null;
        workloadHours?: number;
        updatedBy: string;
      } = { updatedBy: user.id };

      if (dto.title) {
        data.title = dto.title;
        data.slug = await this.uniqueSlug(dto.title, course.id);
      }
      if (dto.synopsis !== undefined) {
        data.synopsis = dto.synopsis;
      }
      if (dto.workloadHours !== undefined) {
        data.workloadHours = Math.max(0, Math.floor(dto.workloadHours));
      }

      await tx.course.update({ where: { id }, data });

      if (dto.categoryIds) {
        await tx.courseCategory.deleteMany({ where: { courseId: id } });
        await tx.courseCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({
            courseId: id,
            categoryId,
          })),
        });
      }

      return tx.course.findFirstOrThrow({
        where: { id },
        include: courseInclude,
      });
    });

    await this.audit.record({
      action: AuditAction.COURSE_UPDATE,
      actorId: user.id,
      metadata: { courseId: id, changes: Object.keys(dto) },
    });
    await this.catalogCache.invalidateAll();

    return updated;
  }

  async softDelete(id: string, user: AuthUser) {
    const course = await this.requireEditable(id, user);
    const removed = await this.prisma.course.update({
      where: { id },
      data: softDeleteData(user.id),
    });

    await this.audit.record({
      action: AuditAction.COURSE_DELETE,
      actorId: user.id,
      metadata: { courseId: id, title: course.title },
    });
    await this.catalogCache.invalidateAll();

    return removed;
  }

  async publish(id: string, user: AuthUser) {
    return this.changeStatus(id, CourseStatus.PUBLISHED, user);
  }

  async archive(id: string, user: AuthUser) {
    return this.changeStatus(id, CourseStatus.ARCHIVED, user);
  }

  /** Volta o curso para rascunho — some do catálogo do aluno. */
  async unpublish(id: string, user: AuthUser) {
    return this.changeStatus(id, CourseStatus.DRAFT, user);
  }

  private async changeStatus(id: string, status: CourseStatus, user: AuthUser) {
    await this.requireEditable(id, user);
    const course = await this.prisma.course.update({
      where: { id },
      data: { status, updatedBy: user.id },
      include: courseInclude,
    });

    await this.audit.record({
      action: AuditAction.COURSE_STATUS_CHANGE,
      actorId: user.id,
      metadata: { courseId: id, status },
    });
    await this.catalogCache.invalidateAll();

    return course;
  }

  /** Cursos opcionais do aluno (inscrição própria). */
  async listMineForStudent(userId: string) {
    return this.listStudentEnrollments(userId, EnrollmentSource.SELF);
  }

  /**
   * Comunidade: todos os cursos com matrícula ACTIVE (grade + opcionais).
   */
  async listMineForCommunity(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        course: { deletedAt: null, status: CourseStatus.PUBLISHED },
      },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
        institution: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ course: { title: 'asc' } }, { courseId: 'asc' }],
    });

    // Dedup por courseId (pode haver matrícula em mais de uma instituição).
    const seen = new Set<string>();
    const out: Array<{
      enrollmentId: string;
      source: EnrollmentSource;
      institution: { id: string; name: string; slug: string };
      course: { id: string; title: string; slug: string };
    }> = [];
    for (const e of enrollments) {
      if (seen.has(e.courseId)) continue;
      seen.add(e.courseId);
      out.push({
        enrollmentId: e.id,
        source: e.source,
        institution: e.institution,
        course: e.course,
      });
    }
    return out;
  }

  /** Comunidades visíveis ao usuário: curso + contagem de publicações. */
  async listCommunities(user: AuthUser) {
    let where: {
      deletedAt: null;
      status?: CourseStatus;
      id?: { in: string[] };
      teachers?: { some: { userId: string; deletedAt: null } };
      institutions?: {
        some: {
          active: true;
          deletedAt: null;
          institutionId: { in: string[] };
        };
      };
    } = { deletedAt: null };

    if (user.role === RoleCode.ALUNO) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          userId: user.id,
          status: EnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
        select: { courseId: true },
      });
      const ids = [...new Set(enrollments.map((e) => e.courseId))];
      if (ids.length === 0) return [];
      where = {
        deletedAt: null,
        status: CourseStatus.PUBLISHED,
        id: { in: ids },
      };
    } else if (user.role === RoleCode.PROFESSOR) {
      where = {
        deletedAt: null,
        teachers: { some: { userId: user.id, deletedAt: null } },
      };
    } else if (user.role === RoleCode.ADM_INSTITUICAO) {
      if (!user.institutionIds.length) return [];
      where = {
        deletedAt: null,
        institutions: {
          some: {
            active: true,
            deletedAt: null,
            institutionId: { in: user.institutionIds },
          },
        },
      };
    } else if (user.role !== RoleCode.ADM_MASTER) {
      throw new ForbiddenException('Sem permissão para listar comunidades');
    }

    const rows = await this.prisma.course.findMany({
      where,
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        slug: true,
        synopsis: true,
        _count: {
          select: {
            communityTopics: { where: { deletedAt: null } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      synopsis: row.synopsis,
      topicCount: row._count.communityTopics,
    }));
  }

  /** Grade curricular: cursos alocados pela instituição/professor. */
  async listCurriculumForStudent(userId: string) {
    return this.listStudentEnrollments(userId, EnrollmentSource.ASSIGNED);
  }

  private async listStudentEnrollments(
    userId: string,
    source: EnrollmentSource,
  ) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        source,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        course: { deletedAt: null, status: CourseStatus.PUBLISHED },
      },
      include: {
        course: { include: { ...courseInclude, ...modulesWithVideosInclude } },
        institution: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ course: { title: 'asc' } }, { courseId: 'asc' }],
    });
    return enrollments.map((e) => {
      const { modules, ...course } = e.course;
      return {
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        source: e.source,
        institution: e.institution,
        enrolled: true,
        firstVideoId: firstVideoId(modules),
        lessonCount: lessonCount(modules),
        course,
      };
    });
  }

  /**
   * Catálogo opcional: com escola = cursos vinculados a ela;
   * sem escola (ou só AVA Aberto) = todos os publicados.
   */
  async listAvailableForStudent(user: AuthUser) {
    const schoolIds = await this.schoolInstitutionIds(
      user.id,
      user.institutionIds,
    );

    const [courses, enrollments] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          deletedAt: null,
          status: CourseStatus.PUBLISHED,
          ...(schoolIds.length
            ? {
                institutions: {
                  some: {
                    active: true,
                    deletedAt: null,
                    institutionId: { in: schoolIds },
                  },
                },
              }
            : {}),
        },
        orderBy: { title: 'asc' },
        include: { ...courseInclude, ...modulesWithVideosInclude },
      }),
      this.prisma.enrollment.findMany({
        where: {
          userId: user.id,
          status: EnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
        select: { courseId: true, source: true },
      }),
    ]);

    const enrolledIds = new Set(enrollments.map((e) => e.courseId));
    return courses.map((row) => {
      const { modules, ...course } = row;
      return {
        enrolled: enrolledIds.has(course.id),
        firstVideoId: firstVideoId(modules),
        lessonCount: lessonCount(modules),
        course,
      };
    });
  }

  /**
   * Home do aluno: obrigatórios (grade), recomendados (categorias que já assiste)
   * e catálogo completo, com % de conclusão por faixa.
   */
  async studentHome(user: AuthUser) {
    if (user.role !== RoleCode.ALUNO) {
      throw new ForbiddenException('Dashboard disponível apenas para alunos');
    }

    const [essentialsRaw, exploreRaw, completedEnrollments, lessonProgress, schoolIds] =
      await Promise.all([
        this.listCurriculumForStudent(user.id),
        this.listAvailableForStudent(user),
        this.prisma.enrollment.findMany({
          where: {
            userId: user.id,
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
            completedAt: { not: null },
          },
          select: { courseId: true },
        }),
        this.prisma.lessonProgress.findMany({
          where: { userId: user.id },
          select: { courseId: true, moduleVideoId: true, completedAt: true },
        }),
        this.schoolInstitutionIds(user.id, user.institutionIds),
      ]);

    const completedByEnrollment = new Set(
      completedEnrollments.map((e) => e.courseId),
    );
    const watchedByCourse = new Map<string, number>();
    for (const row of lessonProgress) {
      if (!row.completedAt) continue;
      watchedByCourse.set(
        row.courseId,
        (watchedByCourse.get(row.courseId) ?? 0) + 1,
      );
    }

    const toCard = (
      item: (typeof exploreRaw)[number] | (typeof essentialsRaw)[number],
    ) => ({
      enrolled: Boolean(item.enrolled),
      firstVideoId: item.firstVideoId,
      course: {
        id: item.course.id,
        title: item.course.title,
        synopsis: item.course.synopsis,
        status: item.course.status,
        categories: item.course.categories.map((c) => ({
          category: { name: c.category.name, id: c.category.id },
        })),
      },
    });

    const isComplete = (
      item: (typeof exploreRaw)[number] | (typeof essentialsRaw)[number],
    ) => {
      if (completedByEnrollment.has(item.course.id)) return true;
      const total = item.lessonCount;
      const watched = watchedByCourse.get(item.course.id) ?? 0;
      return total > 0 && watched >= total;
    };

    const bucket = (
      items: Array<(typeof exploreRaw)[number] | (typeof essentialsRaw)[number]>,
    ) => {
      const cards = items.map(toCard);
      const completed = items.filter((i) => isComplete(i)).length;
      const total = items.length;
      return {
        items: cards,
        total,
        completed,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      };
    };

    const essentialIds = new Set(essentialsRaw.map((e) => e.course.id));

    const catalogById = new Map<string, (typeof exploreRaw)[number]>();
    for (const item of [...essentialsRaw, ...exploreRaw]) {
      catalogById.set(item.course.id, item);
    }

    // Categorias dos cursos em que o aluno já assistiu alguma aula.
    const startedIds = new Set(lessonProgress.map((p) => p.courseId));
    const seedCats = new Set<string>();
    for (const courseId of startedIds) {
      const item = catalogById.get(courseId);
      if (!item) continue;
      for (const cat of item.course.categories) seedCats.add(cat.category.id);
    }

    const finishedIds = new Set<string>();
    for (const item of catalogById.values()) {
      if (isComplete(item)) finishedIds.add(item.course.id);
    }

    const recommendedRaw = [...catalogById.values()]
      .filter((c) => {
        if (!seedCats.size) return false;
        if (startedIds.has(c.course.id) || finishedIds.has(c.course.id)) {
          return false;
        }
        return c.course.categories.some((cat) => seedCats.has(cat.category.id));
      })
      .sort((a, b) => {
        const ae = essentialIds.has(a.course.id) ? 1 : 0;
        const be = essentialIds.has(b.course.id) ? 1 : 0;
        if (ae !== be) return ae - be;
        return a.course.title.localeCompare(b.course.title, 'pt');
      });

    const ranking = await this.studentSchoolRanking(user.id, schoolIds);

    return {
      essentials: bucket(essentialsRaw),
      recommended: bucket(recommendedRaw),
      explore: bucket(exploreRaw),
      ranking,
    };
  }

  /** Ranking da escola: alunos com mais cursos concluídos. */
  private async studentSchoolRanking(userId: string, schoolIds: string[]) {
    if (!schoolIds.length) return [];

    const rows = await this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        completedAt: { not: null },
        user: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
          role: { code: RoleCode.ALUNO },
          memberships: {
            some: {
              deletedAt: null,
              institutionId: { in: schoolIds },
            },
          },
        },
      },
      select: {
        userId: true,
        user: { select: { id: true, name: true, avatarKey: true } },
      },
    });

    const byUser = new Map<
      string,
      { id: string; name: string; hasAvatar: boolean; points: number }
    >();
    for (const row of rows) {
      const cur = byUser.get(row.userId);
      if (cur) {
        cur.points += 1;
      } else {
        byUser.set(row.userId, {
          id: row.user.id,
          name: row.user.name,
          hasAvatar: Boolean(row.user.avatarKey),
          points: 1,
        });
      }
    }

    return [...byUser.values()]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((row, index) => ({
        rank: index + 1,
        id: row.id,
        name: row.name,
        hasAvatar: row.hasAvatar,
        points: row.points,
        isMe: row.id === userId,
      }));
  }

  /** Instituições escolares do aluno (exclui o catálogo livre AVA Aberto). */
  async schoolInstitutionIds(userId: string, fallbackIds: string[]) {
    const ids = fallbackIds.length
      ? fallbackIds
      : (
          await this.prisma.institutionMember.findMany({
            where: { userId, deletedAt: null },
            select: { institutionId: true },
          })
        ).map((m) => m.institutionId);
    if (!ids.length) return [];
    const schools = await this.prisma.institution.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        NOT: { slug: 'ava-aberto' },
      },
      select: { id: true },
    });
    return schools.map((s) => s.id);
  }

  async studentHasSchool(user: AuthUser): Promise<boolean> {
    const ids = await this.schoolInstitutionIds(user.id, user.institutionIds);
    return ids.length > 0;
  }

  /** Aluno se matricula por escolha (opcional) em curso publicado. */
  async enrollSelf(courseId: string, user: AuthUser) {
    if (user.role !== RoleCode.ALUNO) {
      throw new ForbiddenException('Apenas alunos podem se matricular aqui');
    }
    const course = await this.requireActive(courseId);
    if (course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Curso ainda não está publicado');
    }
    return this.enrollStudent(
      courseId,
      user.id,
      user,
      undefined,
      EnrollmentSource.SELF,
    );
  }

  /** Cursos atribuídos ao professor. */
  async listMineForTeacher(userId: string) {
    return this.prisma.course.findMany({
      where: {
        deletedAt: null,
        teachers: { some: { userId, deletedAt: null } },
      },
      orderBy: { title: 'asc' },
      include: courseInclude,
    });
  }

  async listTeachers(courseId: string, actor: AuthUser) {
    await this.access.assertCanManage(courseId, actor);
    return this.prisma.courseTeacher.findMany({
      where: { courseId, deletedAt: null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async assignTeacher(
    courseId: string,
    teacherUserId: string,
    actor: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, actor);
    const teacher = await this.prisma.user.findFirst({
      where: {
        id: teacherUserId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { code: RoleCode.PROFESSOR },
      },
    });
    if (!teacher) {
      throw new BadRequestException('Usuário não é um professor ativo');
    }

    const assignment = await this.prisma.courseTeacher.upsert({
      where: {
        courseId_userId: { courseId, userId: teacherUserId },
      },
      create: {
        courseId,
        userId: teacherUserId,
        createdBy: actor.id,
      },
      update: { deletedAt: null, deletedBy: null, updatedBy: actor.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await this.audit.record({
      action: AuditAction.TEACHER_ASSIGN,
      actorId: actor.id,
      metadata: { courseId, teacherUserId },
    });

    await this.notifications
      .notifyTeacherAssigned({
        courseId,
        teacherUserId,
        actorId: actor.id,
      })
      .catch(() => undefined);
    await this.catalogCache.invalidateAll();

    return assignment;
  }

  async unassignTeacher(
    courseId: string,
    teacherUserId: string,
    actor: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, actor);
    const link = await this.prisma.courseTeacher.findFirst({
      where: { courseId, userId: teacherUserId, deletedAt: null },
    });
    if (!link)
      throw new NotFoundException('Professor não atribuído a este curso');

    await this.prisma.courseTeacher.update({
      where: { id: link.id },
      data: softDeleteData(actor.id),
    });

    await this.audit.record({
      action: AuditAction.TEACHER_UNASSIGN,
      actorId: actor.id,
      metadata: { courseId, teacherUserId },
    });
    await this.catalogCache.invalidateAll();

    return { ok: true };
  }

  /** Turma do curso — matrículas ativas com instituição de origem. */
  async listEnrollments(courseId: string, actor: AuthUser) {
    await this.access.assertCanManage(courseId, actor);

    const scoped =
      actor.role === RoleCode.ADM_INSTITUICAO
        ? { institutionId: { in: actor.institutionIds } }
        : {};

    return this.prisma.enrollment.findMany({
      where: { courseId, deletedAt: null, ...scoped },
      orderBy: { enrolledAt: 'desc' },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        user: { select: { id: true, name: true, email: true, username: true } },
        institution: { select: { id: true, name: true } },
      },
    });
  }

  async removeEnrollment(
    courseId: string,
    studentUserId: string,
    actor: AuthUser,
  ) {
    await this.access.assertCanManage(courseId, actor);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { courseId, userId: studentUserId, deletedAt: null },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');

    if (
      actor.role === RoleCode.ADM_INSTITUICAO &&
      !actor.institutionIds.includes(enrollment.institutionId)
    ) {
      throw new ForbiddenException('Sem acesso a esta instituição');
    }

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { ...softDeleteData(actor.id), status: EnrollmentStatus.INACTIVE },
    });

    await this.audit.record({
      action: AuditAction.ENROLLMENT_DELETE,
      actorId: actor.id,
      institutionId: enrollment.institutionId,
      metadata: { courseId, studentUserId },
    });

    return { ok: true };
  }

  /** Instituições que recebem o curso — usado no painel do master. */
  async listCourseInstitutions(courseId: string, actor: AuthUser) {
    await this.access.assertCanManage(courseId, actor);
    return this.prisma.institutionCourse.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { linkedAt: 'desc' },
      select: {
        id: true,
        active: true,
        linkedAt: true,
        institution: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async enrollStudent(
    courseId: string,
    studentUserId: string,
    actor: AuthUser,
    institutionId?: string,
    source: EnrollmentSource = EnrollmentSource.ASSIGNED,
  ) {
    await this.requireActive(courseId);

    // Matrícula administrativa exige gestão do curso; auto-matrícula do aluno não.
    if (!(
      source === EnrollmentSource.SELF &&
      actor.role === RoleCode.ALUNO &&
      actor.id === studentUserId
    )) {
      await this.access.assertCanManage(courseId, actor);
    }

    const alunoRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ALUNO },
    });

    let memberships = await this.prisma.institutionMember.findMany({
      where: {
        userId: studentUserId,
        deletedAt: null,
        role: { code: RoleCode.ALUNO },
        user: { status: UserStatus.ACTIVE, deletedAt: null },
        ...(institutionId ? { institutionId } : {}),
      },
      include: { institution: { select: { id: true, name: true } } },
    });

    // Inscrição opcional sem instituição: usa o catálogo livre (AVA Aberto).
    if (!memberships.length && source === EnrollmentSource.SELF) {
      const open = await this.ensureOpenCatalogInstitution(actor.id);
      await this.prisma.institutionMember.upsert({
        where: {
          userId_institutionId: {
            userId: studentUserId,
            institutionId: open.id,
          },
        },
        create: {
          userId: studentUserId,
          institutionId: open.id,
          roleId: alunoRole.id,
          createdBy: actor.id,
        },
        update: { deletedAt: null, deletedBy: null, roleId: alunoRole.id },
      });
      await this.prisma.institutionCourse.upsert({
        where: {
          institutionId_courseId: {
            institutionId: open.id,
            courseId,
          },
        },
        create: {
          institutionId: open.id,
          courseId,
          active: true,
          createdBy: actor.id,
        },
        update: { active: true, deletedAt: null, updatedBy: actor.id },
      });
      // Vínculo instituição↔curso altera o catálogo do ADM_INSTITUICAO.
      await this.catalogCache.invalidateAll();
      memberships = await this.prisma.institutionMember.findMany({
        where: {
          userId: studentUserId,
          institutionId: open.id,
          deletedAt: null,
        },
        include: { institution: { select: { id: true, name: true } } },
      });
    }

    if (!memberships.length) {
      throw new BadRequestException(
        'Aluno não encontrado em nenhuma instituição',
      );
    }

    const allowed =
      actor.role === RoleCode.ADM_INSTITUICAO
        ? memberships.filter((m) =>
            actor.institutionIds.includes(m.institutionId),
          )
        : memberships;
    if (!allowed.length) {
      throw new ForbiddenException('Sem acesso à instituição deste aluno');
    }

    // Grade curricular exige curso vinculado à instituição do aluno.
    // Inscrição opcional (SELF) também usa o vínculo (criado acima no modo livre).
    const links = await this.prisma.institutionCourse.findMany({
      where: {
        courseId,
        institutionId: { in: allowed.map((m) => m.institutionId) },
        active: true,
        deletedAt: null,
      },
      select: { institutionId: true },
    });
    const target = allowed.find((m) =>
      links.some((l) => l.institutionId === m.institutionId),
    );
    if (!target) {
      throw new BadRequestException(
        `Vincule o curso à instituição do aluno (${allowed
          .map((m) => m.institution.name)
          .join(', ')}) antes de matricular`,
      );
    }

    const enrollment = await this.prisma.enrollment.upsert({
      where: {
        courseId_userId_institutionId: {
          courseId,
          userId: studentUserId,
          institutionId: target.institutionId,
        },
      },
      create: {
        courseId,
        userId: studentUserId,
        institutionId: target.institutionId,
        status: EnrollmentStatus.ACTIVE,
        source,
        createdBy: actor.id,
      },
      update: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        deletedBy: null,
        updatedBy: actor.id,
        ...(source === EnrollmentSource.ASSIGNED
          ? { source: EnrollmentSource.ASSIGNED }
          : {}),
      },
    });

    await this.audit.record({
      action: AuditAction.ENROLLMENT_CREATE,
      actorId: actor.id,
      institutionId: target.institutionId,
      metadata: { courseId, studentUserId, source },
    });

    return enrollment;
  }

  /** Instituição do catálogo livre (aluno sem escola). */
  private async ensureOpenCatalogInstitution(actorId: string) {
    return this.prisma.institution.upsert({
      where: { slug: 'ava-aberto' },
      create: {
        name: 'AVA Aberto',
        slug: 'ava-aberto',
        status: 'ACTIVE',
        createdBy: actorId,
      },
      update: { status: 'ACTIVE', deletedAt: null },
    });
  }

  async linkCoursesToInstitution(
    institutionId: string,
    courseIds: string[],
    actor: AuthUser,
  ) {
    this.assertInstitutionScope(actor, institutionId);
    if (!courseIds.length) {
      throw new BadRequestException('Informe ao menos um courseId');
    }

    const institution = await this.prisma.institution.findFirst({
      where: { id: institutionId, deletedAt: null },
    });
    if (!institution) throw new NotFoundException('Instituição não encontrada');

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, deletedAt: null },
    });
    if (courses.length !== courseIds.length) {
      throw new BadRequestException('Um ou mais cursos são inválidos');
    }

    const alunoRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ALUNO },
    });

    const alunos = await this.prisma.institutionMember.findMany({
      where: {
        institutionId,
        roleId: alunoRole.id,
        deletedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const linked = [];
      for (const courseId of courseIds) {
        const row = await tx.institutionCourse.upsert({
          where: {
            institutionId_courseId: { institutionId, courseId },
          },
          create: {
            institutionId,
            courseId,
            active: true,
            createdBy: actor.id,
          },
          update: {
            active: true,
            deletedAt: null,
            updatedBy: actor.id,
          },
        });
        linked.push(row);

        for (const aluno of alunos) {
          await tx.enrollment.upsert({
            where: {
              courseId_userId_institutionId: {
                courseId,
                userId: aluno.userId,
                institutionId,
              },
            },
            create: {
              courseId,
              userId: aluno.userId,
              institutionId,
              status: EnrollmentStatus.ACTIVE,
              source: EnrollmentSource.ASSIGNED,
              createdBy: actor.id,
            },
            update: {
              status: EnrollmentStatus.ACTIVE,
              source: EnrollmentSource.ASSIGNED,
              deletedAt: null,
              updatedBy: actor.id,
            },
          });
        }
      }
      return {
        linked: linked.length,
        enrollmentsCreatedOrReactivated: linked.length * alunos.length,
        studentCount: alunos.length,
      };
    });

    await this.audit.record({
      action: AuditAction.INSTITUTION_COURSE_LINK,
      actorId: actor.id,
      institutionId,
      metadata: { courseIds, studentCount: result.studentCount },
    });
    await this.catalogCache.invalidateAll();

    return result;
  }

  async unlinkCourseFromInstitution(
    institutionId: string,
    courseId: string,
    actor: AuthUser,
  ) {
    this.assertInstitutionScope(actor, institutionId);

    const link = await this.prisma.institutionCourse.findFirst({
      where: { institutionId, courseId, deletedAt: null },
    });
    if (!link) throw new NotFoundException('Vínculo não encontrado');

    // Mantém Enrollments — só desativa o vínculo
    const updated = await this.prisma.institutionCourse.update({
      where: { id: link.id },
      data: { active: false, updatedBy: actor.id },
    });

    await this.audit.record({
      action: AuditAction.INSTITUTION_COURSE_UNLINK,
      actorId: actor.id,
      institutionId,
      metadata: { courseId },
    });
    await this.catalogCache.invalidateAll();

    return updated;
  }

  async listInstitutionCourses(institutionId: string, actor: AuthUser) {
    this.assertInstitutionScope(actor, institutionId);
    return this.prisma.institutionCourse.findMany({
      where: { institutionId, deletedAt: null },
      include: { course: { include: courseInclude } },
      orderBy: { linkedAt: 'desc' },
    });
  }

  private assertInstitutionScope(actor: AuthUser, institutionId: string) {
    if (actor.role === RoleCode.ADM_MASTER) return;
    if (!actor.institutionIds.includes(institutionId)) {
      throw new ForbiddenException('Sem acesso a esta instituição');
    }
  }

  private async requireActive(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    return course;
  }

  private async requireEditable(id: string, user: AuthUser) {
    const course = await this.requireActive(id);
    if (user.role === RoleCode.ADM_MASTER) return course;

    if (user.role === RoleCode.PROFESSOR) {
      const assigned = await this.prisma.courseTeacher.findFirst({
        where: { courseId: id, userId: user.id, deletedAt: null },
      });
      if (!assigned) {
        throw new ForbiddenException('Você não está atribuído a este curso');
      }
      return course;
    }

    throw new ForbiddenException('Sem permissão para editar este curso');
  }

  private async assertCategoriesExist(ids: string[]) {
    const count = await this.prisma.category.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Uma ou mais categorias são inválidas');
    }
  }

  private async uniqueSlug(title: string, excludeId?: string) {
    const base = slugify(title) || 'curso';
    let slug = base;
    let i = 2;
    for (;;) {
      const existing = await this.prisma.course.findFirst({
        where: {
          slug,
          deletedAt: null,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });
      if (!existing) return slug;
      slug = `${base}-${i++}`;
    }
  }
}
