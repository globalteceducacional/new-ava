import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Courses CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;

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
    const cat = await prisma.category.findUniqueOrThrow({
      where: { slug: 'programacao' },
    });
    categoryId = cat.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('PROFESSOR cria curso → 201 e vira CourseTeacher', async () => {
    const prof = await loginAs(app, 'professor');
    const title = `Curso Prof ${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(prof.token))
      .send({ title, categoryIds: [categoryId] })
      .expect(201);

    expect(res.body.title).toBe(title);
    const teacher = await prisma.courseTeacher.findFirst({
      where: { courseId: res.body.id, userId: prof.user.id, deletedAt: null },
    });
    expect(teacher).toBeTruthy();
  });

  it('curso sem categoryIds → 400', async () => {
    const prof = await loginAs(app, 'professor');
    await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(prof.token))
      .send({ title: 'Sem categorias' })
      .expect(400);
  });

  it('ALUNO criar curso → 403', async () => {
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(aluno.token))
      .send({ title: 'Hack', categoryIds: [categoryId] })
      .expect(403);
  });

  it('soft-delete: DELETE marca deletedAt e some do GET', async () => {
    const master = await loginAs(app, 'admin');
    const created = await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(master.token))
      .send({ title: `Soft Del ${Date.now()}`, categoryIds: [categoryId] })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/courses/${created.body.id}`)
      .set(authHeader(master.token))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/courses/${created.body.id}`)
      .set(authHeader(master.token))
      .expect(404);

    const row = await prisma.course.findUnique({
      where: { id: created.body.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });
});
