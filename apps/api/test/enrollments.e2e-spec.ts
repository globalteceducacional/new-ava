import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Enrollments & teachers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let progIniId: string;
  let gramId: string;
  let alunoId: string;
  let professorId: string;

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

    progIniId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'programacao-iniciante' },
      })
    ).id;
    gramId = (
      await prisma.course.findUniqueOrThrow({ where: { slug: 'gramatica' } })
    ).id;
    alunoId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'aluno@ifma.edu.br' },
      })
    ).id;
    professorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'professor@ifma.edu.br' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('matricular em curso sem vínculo ativo → 403', async () => {
    const adm = await loginAs(app, 'instituicao');
    // Gramática não está vinculada ao IFMA: ADM_INSTITUICAO não gerencia o curso.
    await request(app.getHttpServer())
      .post(`/courses/${gramId}/enrollments`)
      .set(authHeader(adm.token))
      .send({ studentUserId: alunoId })
      .expect(403);
  });

  it('matrícula manual idempotente → 201', async () => {
    const adm = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .post(`/courses/${progIniId}/enrollments`)
      .set(authHeader(adm.token))
      .send({ studentUserId: alunoId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/courses/${progIniId}/enrollments`)
      .set(authHeader(adm.token))
      .send({ studentUserId: alunoId })
      .expect(201);

    const count = await prisma.enrollment.count({
      where: {
        courseId: progIniId,
        userId: alunoId,
        deletedAt: null,
      },
    });
    expect(count).toBe(1);
  });

  it('atribuir professor e listar', async () => {
    const master = await loginAs(app, 'admin');
    await request(app.getHttpServer())
      .post(`/courses/${gramId}/teachers`)
      .set(authHeader(master.token))
      .send({ teacherUserId: professorId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/courses/${gramId}/teachers`)
      .set(authHeader(master.token))
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.map((t: { userId: string }) => t.userId)).toContain(
      professorId,
    );
  });
});
