import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { QuestionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Grades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await runSeed();
    courseId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'matematica-basico' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('média reflete atividade + quiz; aluno não vê boletim alheio', async () => {
    const prof = await loginAs(app, 'professor');
    const act = await request(app.getHttpServer())
      .post(`/courses/${courseId}/activities`)
      .set(authHeader(prof.token))
      .send({
        title: 'Lista 1',
        rubric: [{ key: 'geral', label: 'Geral', weight: 1 }],
      })
      .expect(201);

    const quiz = await request(app.getHttpServer())
      .post(`/courses/${courseId}/quizzes`)
      .set(authHeader(prof.token))
      .send({
        title: 'Prova rápida',
        questions: [
          {
            type: QuestionType.MCQ,
            text: '1+1',
            options: [
              { text: '2', isCorrect: true },
              { text: '3', isCorrect: false },
            ],
          },
        ],
      })
      .expect(201);

    const aluno = await loginAs(app, 'aluno');
    const sub = await request(app.getHttpServer())
      .post(`/activities/${act.body.id}/submissions`)
      .set(authHeader(aluno.token))
      .send({ text: 'feito' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/submissions/${sub.body.id}/grade`)
      .set(authHeader(prof.token))
      .send({ rubricScores: { geral: 8 } })
      .expect(200);

    const correct = quiz.body.questions[0].options.find(
      (o: { isCorrect: boolean }) => o.isCorrect,
    ).id;
    const attempt = await request(app.getHttpServer())
      .post(`/quizzes/${quiz.body.id}/attempts`)
      .set(authHeader(aluno.token))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/attempts/${attempt.body.id}/finish`)
      .set(authHeader(aluno.token))
      .send({
        answers: [
          {
            questionId: quiz.body.questions[0].id,
            selectedOptionIds: [correct],
          },
        ],
      })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get(`/courses/${courseId}/grades/me`)
      .set(authHeader(aluno.token))
      .expect(200);

    // atividade 8 + quiz 10 → média 9
    expect(me.body.average).toBe(9);

    const masterId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@ava.local' },
      })
    ).id;
    await request(app.getHttpServer())
      .get(`/courses/${courseId}/grades/students/${masterId}`)
      .set(authHeader(aluno.token))
      .expect(403);
  });
});
