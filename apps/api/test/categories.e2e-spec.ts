import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('ALUNO/PROFESSOR criar categoria → 403; MASTER → 201', async () => {
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .post('/categories')
      .set(authHeader(aluno.token))
      .send({ name: `Cat Aluno ${Date.now()}` })
      .expect(403);

    const prof = await loginAs(app, 'professor');
    await request(app.getHttpServer())
      .post('/categories')
      .set(authHeader(prof.token))
      .send({ name: `Cat Prof ${Date.now()}` })
      .expect(403);

    const master = await loginAs(app, 'admin');
    const name = `Categoria Teste ${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/categories')
      .set(authHeader(master.token))
      .send({ name })
      .expect(201);

    expect(res.body.name).toBe(name);
    const row = await prisma.category.findUnique({
      where: { id: res.body.id },
    });
    expect(row?.deletedAt).toBeNull();
  });
});
