import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MediaService } from '../src/media/media.service';
import { MinioService } from '../src/media/minio.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';
import { ensureTinyMp4Fixture, fakeTextAsVideo } from './helpers/media-fixture';

describe('Media upload (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let minio: MinioService;
  let courseId: string;
  let moduleVideoId: string;
  let tinyPath: string;

  beforeAll(async () => {
    tinyPath = ensureTinyMp4Fixture();
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
    minio = app.get(MinioService);
    await runSeed();
    courseId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'programacao-iniciante' },
      })
    ).id;

    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Mídia Upload' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Aula upload' })
      .expect(201);
    moduleVideoId = video.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita MIME inválido', async () => {
    const prof = await loginAs(app, 'professor');
    await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${moduleVideoId}`)
      .set(authHeader(prof.token))
      .attach('file', Buffer.from('hello'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('rejeita magic bytes inválidos com MIME de vídeo', async () => {
    const prof = await loginAs(app, 'professor');
    await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${moduleVideoId}`)
      .set(authHeader(prof.token))
      .attach('file', fakeTextAsVideo(), {
        filename: 'fake.mp4',
        contentType: 'video/mp4',
      })
      .expect(400);
  });

  it('rejeita arquivo acima do tamanho máximo', async () => {
    const prof = await loginAs(app, 'professor');
    const media = app.get(MediaService);
    const spy = jest.spyOn(media, 'maxUploadBytes').mockReturnValue(100);
    try {
      await request(app.getHttpServer())
        .post(`/media/upload?moduleVideoId=${moduleVideoId}`)
        .set(authHeader(prof.token))
        .attach('file', readFileSync(tinyPath), {
          filename: 'tiny.mp4',
          contentType: 'video/mp4',
        })
        .expect(400);
    } finally {
      spy.mockRestore();
    }
  });

  it('upload válido → 201 PROCESSING e objeto no MinIO', async () => {
    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Mídia OK' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Aula ok' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${video.body.id}`)
      .set(authHeader(prof.token))
      .attach('file', readFileSync(tinyPath), {
        filename: 'tiny.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);

    expect(res.body.status).toBe('PROCESSING');
    // storageKey não vai na API (serialize); valida no banco + MinIO.
    const asset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(asset.storageKey).toContain(`originals/${res.body.id}/`);
    const exists = await minio.objectExists(asset.storageKey);
    expect(exists).toBe(true);
  });
});
