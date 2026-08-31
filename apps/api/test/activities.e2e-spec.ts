import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Activities (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;
  let gramId: string;

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
    gramId = (
      await prisma.course.findUniqueOrThrow({ where: { slug: 'gramatica' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('prazo vencido → 400; correção com rubrica; aluno sem matrícula → 403', async () => {
    const prof = await loginAs(app, 'professor');
    const past = new Date(Date.now() - 86400000).toISOString();

    const closed = await request(app.getHttpServer())
      .post(`/courses/${courseId}/activities`)
      .set(authHeader(prof.token))
      .send({
        title: 'Atividade atrasada',
        dueDate: past,
        allowLate: false,
        rubric: [
          { key: 'clareza', label: 'Clareza', weight: 40 },
          { key: 'funcionamento', label: 'Funcionamento', weight: 40 },
          { key: 'comentarios', label: 'Comentários', weight: 20 },
        ],
      })
      .expect(201);

    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .post(`/activities/${closed.body.id}/submissions`)
      .set(authHeader(aluno.token))
      .send({ text: 'tarde' })
      .expect(400);

    const open = await request(app.getHttpServer())
      .post(`/courses/${courseId}/activities`)
      .set(authHeader(prof.token))
      .send({
        title: 'Atividade ok',
        rubric: [
          { key: 'clareza', label: 'Clareza', weight: 40 },
          { key: 'funcionamento', label: 'Funcionamento', weight: 40 },
          { key: 'comentarios', label: 'Comentários', weight: 20 },
        ],
      })
      .expect(201);

    const sub = await request(app.getHttpServer())
      .post(`/activities/${open.body.id}/submissions`)
      .set(authHeader(aluno.token))
      .send({ text: 'minha entrega' })
      .expect(201);

    const graded = await request(app.getHttpServer())
      .patch(`/submissions/${sub.body.id}/grade`)
      .set(authHeader(prof.token))
      .send({
        rubricScores: { clareza: 8, funcionamento: 10, comentarios: 5 },
        feedback: 'Bom trabalho',
      })
      .expect(200);

    expect(graded.body.grade).toBe(8.2);

    // aluno não matriculado em gramática (só a professora Marina gerencia esse curso)
    const professora = await loginAs(app, 'marina.souza');
    const gramAct = await request(app.getHttpServer())
      .post(`/courses/${gramId}/activities`)
      .set(authHeader(professora.token))
      .send({ title: 'Só gramática' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/activities/${gramAct.body.id}/submissions`)
      .set(authHeader(aluno.token))
      .send({ text: 'hack' })
      .expect(403);
  });
});
