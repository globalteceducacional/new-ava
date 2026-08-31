import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { RoleCode, UserStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Community (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;
  let ifmaId: string;
  let videoId: string;

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
    ifmaId = (
      await prisma.institution.findUniqueOrThrow({ where: { slug: 'ifma' } })
    ).id;

    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Fundamentos' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Variáveis e tipos' })
      .expect(201);
    videoId = video.body.id;

    // segundo aluno no IFMA
    const alunoRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ALUNO },
    });
    const hash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
    const aluno2 = await prisma.user.upsert({
      where: { email: 'aluno2@ifma.edu.br' },
      create: {
        email: 'aluno2@ifma.edu.br',
        username: 'aluno2.ifma',
        name: 'Aluno Dois',
        passwordHash: hash,
        status: UserStatus.ACTIVE,
        roleId: alunoRole.id,
      },
      update: { deletedAt: null, passwordHash: hash },
    });
    await prisma.institutionMember.upsert({
      where: {
        userId_institutionId: { userId: aluno2.id, institutionId: ifmaId },
      },
      create: {
        userId: aluno2.id,
        institutionId: ifmaId,
        roleId: alunoRole.id,
      },
      update: { deletedAt: null },
    });
    await prisma.enrollment.upsert({
      where: {
        courseId_userId_institutionId: {
          courseId,
          userId: aluno2.id,
          institutionId: ifmaId,
        },
      },
      create: { courseId, userId: aluno2.id, institutionId: ifmaId },
      update: { status: 'ACTIVE', deletedAt: null },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('tópico com vídeo, resposta de 2º aluno e professor; sem matrícula → 403', async () => {
    const aluno = await loginAs(app, 'aluno');
    const topic = await request(app.getHttpServer())
      .post(`/courses/${courseId}/topics`)
      .set(authHeader(aluno.token))
      .send({
        title: 'Dúvida em variáveis',
        body: 'Assisti Variáveis e tipos e...',
        moduleVideoId: videoId,
      })
      .expect(201);

    const aluno2 = await loginAs(app, 'aluno2@ifma.edu.br');
    await request(app.getHttpServer())
      .post(`/topics/${topic.body.id}/replies`)
      .set(authHeader(aluno2.token))
      .send({ body: 'Eu também tive essa dúvida' })
      .expect(201);

    const prof = await loginAs(app, 'professor');
    const reply = await request(app.getHttpServer())
      .post(`/topics/${topic.body.id}/replies`)
      .set(authHeader(prof.token))
      .send({ body: 'Boa pergunta — veja o material PDF.' })
      .expect(201);
    expect(reply.body.author.role).toBe(RoleCode.PROFESSOR);

    const thread = await request(app.getHttpServer())
      .get(`/topics/${topic.body.id}`)
      .set(authHeader(aluno.token))
      .expect(200);
    expect(thread.body.replies.length).toBeGreaterThanOrEqual(2);

    const gram = await prisma.course.findUniqueOrThrow({
      where: { slug: 'gramatica' },
    });
    await request(app.getHttpServer())
      .post(`/courses/${gram.id}/topics`)
      .set(authHeader(aluno.token))
      .send({ title: 'Hack', body: 'sem matrícula' })
      .expect(403);
  });
});
