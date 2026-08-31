import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateActivityDto,
  GradeSubmissionDto,
  SubmitActivityDto,
  UpdateActivityDto,
} from './dto/activity.dto';
import { calculateRubricGrade, type RubricCriterion } from './rubric.util';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async listByCourse(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    return this.prisma.activity.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        courseId: true,
        moduleId: true,
        title: true,
        description: true,
        dueDate: true,
        allowLate: true,
        rubric: true,
        createdAt: true,
      },
    });
  }

  async create(courseId: string, dto: CreateActivityDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    const moduleId = await this.resolveModuleId(courseId, dto.moduleId);
    const activity = await this.prisma.activity.create({
      data: {
        courseId,
        moduleId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        rubric: (dto.rubric ?? undefined) as Prisma.InputJsonValue | undefined,
        allowLate: dto.allowLate ?? false,
        createdBy: user.id,
      },
    });
    await this.notifications
      .notifyActivityAdded(courseId, activity.title, user.id)
      .catch(() => undefined);
    return activity;
  }

  async update(activityId: string, dto: UpdateActivityDto, user: AuthUser) {
    const activity = await this.requireActivity(activityId);
    await this.access.assertCanManage(activity.courseId, user);

    let moduleId: string | null | undefined;
    if (dto.moduleId !== undefined) {
      moduleId =
        dto.moduleId === null
          ? null
          : await this.resolveModuleId(activity.courseId, dto.moduleId);
    }

    return this.prisma.activity.update({
      where: { id: activityId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(moduleId !== undefined ? { moduleId } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(dto.rubric !== undefined
          ? {
              rubric:
                dto.rubric === null
                  ? Prisma.DbNull
                  : (dto.rubric as unknown as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.allowLate !== undefined ? { allowLate: dto.allowLate } : {}),
        updatedBy: user.id,
      },
    });
  }

  async softDelete(activityId: string, user: AuthUser) {
    const activity = await this.requireActivity(activityId);
    await this.access.assertCanManage(activity.courseId, user);
    return this.prisma.activity.update({
      where: { id: activityId },
      data: softDeleteData(user.id),
    });
  }

  async get(activityId: string, user: AuthUser) {
    const activity = await this.requireActivity(activityId);
    await this.access.assertCanView(activity.courseId, user);
    return activity;
  }

  async submit(activityId: string, dto: SubmitActivityDto, user: AuthUser) {
    if (user.role !== RoleCode.ALUNO && user.role !== RoleCode.ADM_MASTER) {
      throw new BadRequestException('Apenas alunos entregam atividades');
    }
    const activity = await this.requireActivity(activityId);
    await this.access.assertEnrolled(activity.courseId, user.id);

    if (
      activity.dueDate &&
      !activity.allowLate &&
      activity.dueDate.getTime() < Date.now()
    ) {
      throw new BadRequestException('Prazo da atividade encerrado');
    }

    if (!dto.text && !dto.fileUrl) {
      throw new BadRequestException('Informe texto e/ou arquivo');
    }

    return this.prisma.activitySubmission.upsert({
      where: {
        activityId_studentId: { activityId, studentId: user.id },
      },
      create: {
        activityId,
        studentId: user.id,
        text: dto.text,
        fileUrl: dto.fileUrl,
        createdBy: user.id,
      },
      update: {
        text: dto.text,
        fileUrl: dto.fileUrl,
        updatedBy: user.id,
        submittedAt: new Date(),
        grade: null,
        feedback: null,
        gradedAt: null,
        rubricScores: undefined,
      },
    });
  }

  async grade(submissionId: string, dto: GradeSubmissionDto, user: AuthUser) {
    const submission = await this.prisma.activitySubmission.findFirst({
      where: { id: submissionId, deletedAt: null },
      include: { activity: true },
    });
    if (!submission) throw new NotFoundException('Entrega não encontrada');

    await this.access.assertCanManage(submission.activity.courseId, user);

    const rubric = submission.activity.rubric as RubricCriterion[] | null;
    const grade = calculateRubricGrade(rubric, dto.rubricScores);

    return this.prisma.activitySubmission.update({
      where: { id: submissionId },
      data: {
        rubricScores: dto.rubricScores,
        grade,
        feedback: dto.feedback,
        gradedAt: new Date(),
        updatedBy: user.id,
      },
    });
  }

  async listSubmissions(activityId: string, user: AuthUser) {
    const activity = await this.requireActivity(activityId);
    await this.access.assertCanManage(activity.courseId, user);
    return this.prisma.activitySubmission.findMany({
      where: { activityId, deletedAt: null },
      select: {
        id: true,
        text: true,
        fileUrl: true,
        grade: true,
        feedback: true,
        rubricScores: true,
        submittedAt: true,
        gradedAt: true,
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private async requireActivity(id: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    return activity;
  }

  /** Garante que o módulo existe e pertence ao curso. */
  private async resolveModuleId(courseId: string, moduleId?: string | null) {
    if (!moduleId) return null;
    const mod = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, courseId, deletedAt: null },
      select: { id: true },
    });
    if (!mod) throw new BadRequestException('Módulo inválido para este curso');
    return mod.id;
  }
}
