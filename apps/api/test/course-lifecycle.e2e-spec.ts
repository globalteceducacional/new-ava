import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CourseStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Course lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ifmaId: string;
  let categoryId: string;

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
    ifmaId = (
      await prisma.institution.findUniqueOrThrow({ where: { slug: 'ifma' } })
    ).id;
    categoryId = (
      await prisma.category.findUniqueOrThrow({ where: { slug: 'matematica' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('DRAFT não aparece na grade; PUBLISHED aparece; ARCHIVED some', async () => {
    const master = await loginAs(app, 'admin');
    const created = await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(master.token))
      .send({ title: `Ciclo ${Date.now()}`, categoryIds: [categoryId] })
      .expect(201);

    const courseId = created.body.id as string;
    expect(created.body.status).toBe(CourseStatus.DRAFT);

    const adm = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .post(`/institutions/${ifmaId}/courses`)
      .set(authHeader(adm.token))
      .send({ courseIds: [courseId] })
      .expect(201);

    const aluno = await loginAs(app, 'aluno');
    // Vínculo cria matrícula ASSIGNED → aparece em /curriculum, não em /mine (SELF).
    let grade = await request(app.getHttpServer())
      .get('/courses/curriculum')
      .set(authHeader(aluno.token))
      .expect(200);
    expect(
      grade.body.map((e: { course: { id: string } }) => e.course.id),
    ).not.toContain(courseId);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/publish`)
      .set(authHeader(master.token))
      .expect(200);

    grade = await request(app.getHttpServer())
      .get('/courses/curriculum')
      .set(authHeader(aluno.token))
      .expect(200);
    expect(
      grade.body.map((e: { course: { id: string } }) => e.course.id),
    ).toContain(courseId);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/archive`)
      .set(authHeader(master.token))
      .expect(200);

    grade = await request(app.getHttpServer())
      .get('/courses/curriculum')
      .set(authHeader(aluno.token))
      .expect(200);
    expect(
      grade.body.map((e: { course: { id: string } }) => e.course.id),
    ).not.toContain(courseId);
  });
});
