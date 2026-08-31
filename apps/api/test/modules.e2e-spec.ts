import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ModuleMaterialType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Modules playlist (e2e)', () => {
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

  it('cria módulo com 2 vídeos e materiais', async () => {
    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Fundamentos', description: 'Playlist inicial' })
      .expect(201);

    const v1 = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Variáveis e tipos', description: 'Intro' })
      .expect(201);

    const v2 = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Condicionais' })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${v1.body.id}/materials`,
      )
      .set(authHeader(prof.token))
      .send({
        type: ModuleMaterialType.PDF,
        title: 'Slides',
        url: 'https://example.com/a.pdf',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/courses/${courseId}/modules/${mod.body.id}/videos/${v2.body.id}/materials`,
      )
      .set(authHeader(prof.token))
      .send({
        type: ModuleMaterialType.LINK,
        title: 'Docs',
        url: 'https://example.com',
      })
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/courses/${courseId}/modules/${mod.body.id}`)
      .set(authHeader(prof.token))
      .expect(200);

    expect(got.body.videos).toHaveLength(2);
    expect(got.body.videos[0].materials.length).toBeGreaterThanOrEqual(1);
    expect(got.body.videos[1].materials.length).toBeGreaterThanOrEqual(1);
  });
});
