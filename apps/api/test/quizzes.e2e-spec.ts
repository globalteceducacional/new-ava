import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { QuestionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Quizzes (e2e)', () => {
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
        where: { slug: 'programacao-iniciante' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('limite de tentativas e nota automática', async () => {
    const prof = await loginAs(app, 'professor');
    const quiz = await request(app.getHttpServer())
      .post(`/courses/${courseId}/quizzes`)
      .set(authHeader(prof.token))
      .send({
        title: 'Quiz MCQ',
        maxAttempts: 1,
        questions: [
          {
            type: QuestionType.MCQ,
            text: '2+2?',
            options: [
              { text: '4', isCorrect: true },
              { text: '5', isCorrect: false },
            ],
          },
          {
            type: QuestionType.TF,
            text: 'JS é tipado estaticamente',
            options: [
              { text: 'Verdadeiro', isCorrect: false },
              { text: 'Falso', isCorrect: true },
            ],
          },
        ],
      })
      .expect(201);

    const q1 = quiz.body.questions[0];
    const q2 = quiz.body.questions[1];
    const correct1 = q1.options.find(
      (o: { isCorrect: boolean }) => o.isCorrect,
    ).id;
    const correct2 = q2.options.find(
      (o: { isCorrect: boolean }) => o.isCorrect,
    ).id;

    const aluno = await loginAs(app, 'aluno');
    const attempt = await request(app.getHttpServer())
      .post(`/quizzes/${quiz.body.id}/attempts`)
      .set(authHeader(aluno.token))
      .expect(201);

    const finished = await request(app.getHttpServer())
      .post(`/attempts/${attempt.body.id}/finish`)
      .set(authHeader(aluno.token))
      .send({
        answers: [
          { questionId: q1.id, selectedOptionIds: [correct1] },
          { questionId: q2.id, selectedOptionIds: [correct2] },
        ],
      })
      .expect(201);

    expect(finished.body.score).toBe(2);
    expect(finished.body.maxScore).toBe(2);

    await request(app.getHttpServer())
      .post(`/quizzes/${quiz.body.id}/attempts`)
      .set(authHeader(aluno.token))
      .expect(400);
  });
});
