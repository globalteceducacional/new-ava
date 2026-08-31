import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Course content editor CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterToken: string;
  let courseId: string;
  let categoryId: string;

  const stamp = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await runSeed();
    masterToken = (await loginAs(app, 'admin')).token;

    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: 'programacao' },
    });
    categoryId = category.id;

    const course = await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(masterToken))
      .send({ title: `Curso Editor ${stamp}`, categoryIds: [categoryId] })
      .expect(201);
    courseId = course.body.id;
  });

  afterAll(async () => {
    if (courseId) {
      // Remove vínculo/matrículas criados no teste do quiz antes de apagar o curso.
      await prisma.institutionCourse.deleteMany({ where: { courseId } });
      await prisma.enrollment.deleteMany({ where: { courseId } });
      await prisma.course.deleteMany({ where: { id: courseId } });
    }
    await app.close();
  });

  it('content-items: create, update, reorder, delete', async () => {
    const a = await request(app.getHttpServer())
      .post(`/courses/${courseId}/content-items`)
      .set(authHeader(masterToken))
      .send({ type: 'TEXT', title: 'Intro', body: 'Olá' })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post(`/courses/${courseId}/content-items`)
      .set(authHeader(masterToken))
      .send({
        type: 'LINK',
        title: 'MDN',
        url: 'https://developer.mozilla.org',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/content-items/${a.body.id}`)
      .set(authHeader(masterToken))
      .send({ title: 'Introdução' })
      .expect(200);

    const reordered = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/content-items/reorder`)
      .set(authHeader(masterToken))
      .send({ orderedIds: [b.body.id, a.body.id] })
      .expect(200);
    expect(reordered.body[0].id).toBe(b.body.id);

    await request(app.getHttpServer())
      .delete(`/courses/${courseId}/content-items/${b.body.id}`)
      .set(authHeader(masterToken))
      .expect(200);
  });

  it('modules/videos/materials: CRUD + reorder', async () => {
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(masterToken))
      .send({ title: 'Módulo 1', description: 'Fundamentos' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/modules/${mod.body.id}`)
      .set(authHeader(masterToken))
      .send({ title: 'Módulo 1 — Atualizado' })
      .expect(200);

    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(masterToken))
      .send({ title: 'Aula 1', description: 'Visão geral' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${video.body.id}`,
      )
      .set(authHeader(masterToken))
      .send({ title: 'Aula 1 — Revisada' })
      .expect(200);

    const material = await request(app.getHttpServer())
      .post(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${video.body.id}/materials`,
      )
      .set(authHeader(masterToken))
      .send({
        type: 'LINK',
        title: 'Slides',
        url: 'https://example.com/slides',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${video.body.id}/materials/${material.body.id}`,
      )
      .set(authHeader(masterToken))
      .send({ title: 'Slides PDF' })
      .expect(200);

    const mod2 = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(masterToken))
      .send({ title: 'Módulo 2' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/modules/reorder`)
      .set(authHeader(masterToken))
      .send({ orderedIds: [mod2.body.id, mod.body.id] })
      .expect(200);
    expect(list.body[0].id).toBe(mod2.body.id);

    await request(app.getHttpServer())
      .delete(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${video.body.id}/materials/${material.body.id}`,
      )
      .set(authHeader(masterToken))
      .expect(200);

    await request(app.getHttpServer())
      .delete(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${video.body.id}`,
      )
      .set(authHeader(masterToken))
      .expect(200);
  });

  it('activities: create, update, delete', async () => {
    const created = await request(app.getHttpServer())
      .post(`/courses/${courseId}/activities`)
      .set(authHeader(masterToken))
      .send({
        title: 'Lista 1',
        description: 'Descreva um algoritmo',
        allowLate: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/activities/${created.body.id}`)
      .set(authHeader(masterToken))
      .send({ title: 'Lista 1 — revisada' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/activities/${created.body.id}`)
      .set(authHeader(masterToken))
      .expect(200);
  });

  it('quizzes: create, update metadata, block question change after attempt, delete', async () => {
    const created = await request(app.getHttpServer())
      .post(`/courses/${courseId}/quizzes`)
      .set(authHeader(masterToken))
      .send({
        title: 'Quiz rápido',
        graded: true,
        questions: [
          {
            type: 'MCQ',
            text: '2+2?',
            options: [
              { text: '4', isCorrect: true },
              { text: '5', isCorrect: false },
            ],
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/quizzes/${created.body.id}`)
      .set(authHeader(masterToken))
      .send({ title: 'Quiz rápido — v2', description: 'Revise' })
      .expect(200);

    // Aluno seed pode não estar matriculado neste curso novo — matricule via vínculo IFMA
    const ifma = await prisma.institution.findUniqueOrThrow({
      where: { slug: 'ifma' },
    });
    await request(app.getHttpServer())
      .post(`/institutions/${ifma.id}/courses`)
      .set(authHeader(masterToken))
      .send({ courseIds: [courseId] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/publish`)
      .set(authHeader(masterToken))
      .expect(200);

    const aluno = await loginAs(app, 'aluno');
    const attempt = await request(app.getHttpServer())
      .post(`/quizzes/${created.body.id}/attempts`)
      .set(authHeader(aluno.token))
      .expect(201);

    const quizDetail = await request(app.getHttpServer())
      .get(`/quizzes/${created.body.id}`)
      .set(authHeader(aluno.token))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/attempts/${attempt.body.id}/finish`)
      .set(authHeader(aluno.token))
      .send({
        answers: [
          {
            questionId: quizDetail.body.questions[0].id,
            selectedOptionIds: [quizDetail.body.questions[0].options[0].id],
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/quizzes/${created.body.id}`)
      .set(authHeader(masterToken))
      .send({
        questions: [
          {
            type: 'MCQ',
            text: 'Mudança estrutural',
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/quizzes/${created.body.id}`)
      .set(authHeader(masterToken))
      .expect(200);
  });

  it('ALUNO não cria conteúdo → 403', async () => {
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(aluno.token))
      .send({ title: 'Hack' })
      .expect(403);
  });
});
