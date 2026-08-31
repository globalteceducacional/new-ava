import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateQuizDto,
  FinishAttemptDto,
  UpdateQuizDto,
} from './dto/quiz.dto';
import { gradeQuizAttempt } from './grading.util';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listByCourse(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    return this.prisma.quiz.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        courseId: true,
        moduleId: true,
        title: true,
        description: true,
        maxAttempts: true,
        timeLimitSec: true,
        graded: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        _count: { select: { questions: true } },
      },
    });
  }

  async create(courseId: string, dto: CreateQuizDto, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);
    this.assertQuestionsValid(dto.questions);
    const moduleId = await this.resolveModuleId(courseId, dto.moduleId);

    return this.prisma.quiz.create({
      data: {
        courseId,
        moduleId,
        title: dto.title,
        description: dto.description,
        maxAttempts: dto.maxAttempts,
        timeLimitSec: dto.timeLimitSec,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        shuffleOptions: dto.shuffleOptions ?? false,
        graded: dto.graded ?? true,
        createdBy: user.id,
        questions: {
          create: dto.questions.map((q, qi) => ({
            type: q.type,
            text: q.text,
            points: q.points ?? 1,
            answerKey: q.answerKey as object | undefined,
            sortOrder: qi,
            createdBy: user.id,
            options: {
              create: (q.options ?? []).map((o, oi) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                sortOrder: oi,
                createdBy: user.id,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          include: { options: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async update(quizId: string, dto: UpdateQuizDto, user: AuthUser) {
    const quiz = await this.requireQuiz(quizId);
    await this.access.assertCanManage(quiz.courseId, user);

    if (dto.questions) {
      this.assertQuestionsValid(dto.questions);
      const finished = await this.prisma.quizAttempt.count({
        where: {
          quizId,
          deletedAt: null,
          finishedAt: { not: null },
        },
      });
      if (finished > 0) {
        throw new BadRequestException(
          'Não é possível alterar perguntas após existirem tentativas finalizadas',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let moduleId: string | null | undefined;
      if (dto.moduleId !== undefined) {
        moduleId =
          dto.moduleId === null
            ? null
            : await this.resolveModuleId(quiz.courseId, dto.moduleId);
      }

      await tx.quiz.update({
        where: { id: quizId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(moduleId !== undefined ? { moduleId } : {}),
          ...(dto.maxAttempts !== undefined
            ? { maxAttempts: dto.maxAttempts }
            : {}),
          ...(dto.timeLimitSec !== undefined
            ? { timeLimitSec: dto.timeLimitSec }
            : {}),
          ...(dto.shuffleQuestions !== undefined
            ? { shuffleQuestions: dto.shuffleQuestions }
            : {}),
          ...(dto.shuffleOptions !== undefined
            ? { shuffleOptions: dto.shuffleOptions }
            : {}),
          ...(dto.graded !== undefined ? { graded: dto.graded } : {}),
          updatedBy: user.id,
        },
      });

      if (dto.questions) {
        const stamp = softDeleteData(user.id);
        const existing = await tx.question.findMany({
          where: { quizId, deletedAt: null },
          select: { id: true },
        });
        const questionIds = existing.map((q) => q.id);
        if (questionIds.length) {
          await tx.questionOption.updateMany({
            where: { questionId: { in: questionIds }, deletedAt: null },
            data: stamp,
          });
          await tx.question.updateMany({
            where: { id: { in: questionIds } },
            data: stamp,
          });
        }

        for (const [qi, q] of dto.questions.entries()) {
          const question = await tx.question.create({
            data: {
              quizId,
              type: q.type,
              text: q.text,
              points: q.points ?? 1,
              answerKey: q.answerKey as object | undefined,
              sortOrder: qi,
              createdBy: user.id,
            },
          });
          if (q.options?.length) {
            await tx.questionOption.createMany({
              data: q.options.map((o, oi) => ({
                questionId: question.id,
                text: o.text,
                isCorrect: o.isCorrect,
                sortOrder: oi,
                createdBy: user.id,
              })),
            });
          }
        }
      }

      return tx.quiz.findFirstOrThrow({
        where: { id: quizId },
        include: {
          questions: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              options: {
                where: { deletedAt: null },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      });
    });
  }

  async softDelete(quizId: string, user: AuthUser) {
    const quiz = await this.requireQuiz(quizId);
    await this.access.assertCanManage(quiz.courseId, user);
    return this.prisma.quiz.update({
      where: { id: quizId },
      data: softDeleteData(user.id),
    });
  }

  async getForStudent(quizId: string, user: AuthUser) {
    const quiz = await this.requireQuiz(quizId);
    await this.access.assertCanView(quiz.courseId, user);

    const questions = quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      sortOrder: q.sortOrder,
      options: q.options
        .filter((o) => !o.deletedAt)
        .map((o) => ({
          id: o.id,
          text: o.text,
          ...(user.role === RoleCode.ALUNO ? {} : { isCorrect: o.isCorrect }),
        })),
    }));

    if (quiz.shuffleQuestions && user.role === RoleCode.ALUNO) {
      shuffleInPlace(questions);
    }
    if (quiz.shuffleOptions && user.role === RoleCode.ALUNO) {
      for (const q of questions) shuffleInPlace(q.options);
    }

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      maxAttempts: quiz.maxAttempts,
      timeLimitSec: quiz.timeLimitSec,
      graded: quiz.graded,
      courseId: quiz.courseId,
      questions,
    };
  }

  async startAttempt(quizId: string, user: AuthUser) {
    const quiz = await this.requireQuiz(quizId);
    await this.access.assertEnrolled(quiz.courseId, user.id);

    if (quiz.maxAttempts != null) {
      const count = await this.prisma.quizAttempt.count({
        where: { quizId, studentId: user.id, deletedAt: null },
      });
      if (count >= quiz.maxAttempts) {
        throw new BadRequestException('Limite de tentativas atingido');
      }
    }

    return this.prisma.quizAttempt.create({
      data: {
        quizId,
        studentId: user.id,
        createdBy: user.id,
      },
    });
  }

  async finishAttempt(
    attemptId: string,
    dto: FinishAttemptDto,
    user: AuthUser,
  ) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, deletedAt: null },
      include: {
        quiz: {
          include: {
            questions: {
              where: { deletedAt: null },
              include: { options: { where: { deletedAt: null } } },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    if (attempt.studentId !== user.id && user.role !== RoleCode.ADM_MASTER) {
      throw new BadRequestException('Tentativa de outro aluno');
    }
    if (attempt.finishedAt) {
      throw new BadRequestException('Tentativa já finalizada');
    }

    if (attempt.quiz.timeLimitSec && attempt.quiz.timeLimitSec > 0) {
      const elapsedSec =
        (Date.now() - new Date(attempt.startedAt).getTime()) / 1000;
      const graceSec = 15;
      if (elapsedSec > attempt.quiz.timeLimitSec + graceSec) {
        throw new BadRequestException('Tempo do questionário esgotado');
      }
    }

    const result = gradeQuizAttempt(
      attempt.quiz.questions.map((q) => ({
        id: q.id,
        type: q.type,
        points: q.points,
        answerKey: q.answerKey,
        options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      })),
      dto.answers,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const a of result.answers) {
        await tx.quizAnswer.upsert({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: a.questionId,
            },
          },
          create: {
            attemptId,
            questionId: a.questionId,
            selectedOptionIds: a.selectedOptionIds,
            value: a.value,
            isCorrect: a.isCorrect,
            pointsAwarded: a.pointsAwarded,
          },
          update: {
            selectedOptionIds: a.selectedOptionIds,
            value: a.value,
            isCorrect: a.isCorrect,
            pointsAwarded: a.pointsAwarded,
          },
        });
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          finishedAt: new Date(),
          score: attempt.quiz.graded ? result.score : null,
          maxScore: result.maxScore,
          pendingEssay: result.pendingEssay,
        },
      });
    });

    return {
      attemptId,
      score: attempt.quiz.graded ? result.score : null,
      maxScore: result.maxScore,
      pendingEssay: result.pendingEssay,
      percent:
        result.maxScore > 0
          ? Math.round((result.score / result.maxScore) * 1000) / 10
          : 0,
    };
  }

  /** Tentativas finalizadas por aluno (professor) — correções / notas automáticas. */
  async listAttempts(quizId: string, user: AuthUser) {
    const quiz = await this.requireQuiz(quizId);
    await this.access.assertCanManage(quiz.courseId, user);

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, deletedAt: null, finishedAt: { not: null } },
      include: {
        student: { select: { id: true, name: true, email: true } },
        answers: {
          include: {
            question: {
              select: {
                id: true,
                text: true,
                type: true,
                points: true,
                sortOrder: true,
                options: {
                  where: { deletedAt: null },
                  select: { id: true, text: true, isCorrect: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { finishedAt: 'desc' },
    });

    const latestByStudent = new Map<string, (typeof attempts)[number]>();
    for (const att of attempts) {
      if (!latestByStudent.has(att.studentId)) {
        latestByStudent.set(att.studentId, att);
      }
    }

    return Array.from(latestByStudent.values()).map((att) => {
      const grade10 =
        att.score != null && att.maxScore != null && att.maxScore > 0
          ? Math.round((att.score / att.maxScore) * 100) / 10
          : null;

      const answers = att.answers
        .map((a) => {
          const options = a.question.options;
          const selectedLabels = a.selectedOptionIds
            .map((id) => options.find((o) => o.id === id)?.text)
            .filter((t): t is string => Boolean(t));
          const correctLabels = options
            .filter((o) => o.isCorrect)
            .map((o) => o.text);
          return {
            questionId: a.questionId,
            questionText: a.question.text,
            questionType: a.question.type,
            sortOrder: a.question.sortOrder,
            points: a.question.points,
            value: a.value,
            selectedOptionIds: a.selectedOptionIds,
            selectedLabels,
            correctLabels,
            isCorrect: a.isCorrect,
            pointsAwarded: a.pointsAwarded,
            pending: a.isCorrect === null,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        id: att.id,
        student: att.student,
        score: att.score,
        maxScore: att.maxScore,
        grade10,
        pendingEssay: att.pendingEssay,
        finishedAt: att.finishedAt,
        corrected: !att.pendingEssay && grade10 != null,
        answers,
      };
    });
  }

  private assertQuestionsValid(
    questions: Array<{
      type: string;
      options?: Array<{ isCorrect: boolean }>;
    }>,
  ) {
    for (const q of questions) {
      if (q.type === 'MCQ' || q.type === 'TF') {
        const opts = q.options ?? [];
        if (opts.length < 2) {
          throw new BadRequestException(
            'Questões de múltipla escolha precisam de ao menos 2 opções',
          );
        }
        if (!opts.some((o) => o.isCorrect)) {
          throw new BadRequestException(
            'Marque ao menos uma opção correta em cada questão objetiva',
          );
        }
      }
    }
  }

  private async requireQuiz(id: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id, deletedAt: null },
      include: {
        questions: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz não encontrado');
    return quiz;
  }

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

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
