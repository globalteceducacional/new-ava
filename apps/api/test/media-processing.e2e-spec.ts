import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import request from 'supertest';
import { MediaAssetStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MinioService } from '../src/media/minio.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';
import {
  corruptMp4WithFtyp,
  ensureTinyMp4Fixture,
} from './helpers/media-fixture';

async function waitForStatus(
  prisma: PrismaService,
  id: string,
  statuses: MediaAssetStatus[],
  timeoutMs = 60_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    if (statuses.includes(asset.status)) return asset;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout aguardando status ${statuses.join('|')} em ${id}`);
}

describe('Media processing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let minio: MinioService;
  let courseId: string;
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
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  it('processa vídeo válido até READY com HLS no MinIO', async () => {
    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Proc OK' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Proc aula' })
      .expect(201);

    const up = await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${video.body.id}`)
      .set(authHeader(prof.token))
      .attach('file', readFileSync(tinyPath), {
        filename: 'tiny.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);

    const ready = await waitForStatus(prisma, up.body.id, [
      MediaAssetStatus.READY,
    ]);
    expect(ready.hlsPrefix).toBeTruthy();
    const m3u8 = await minio.objectExists(`${ready.hlsPrefix}index.m3u8`);
    expect(m3u8).toBe(true);
  }, 90_000);

  it('vídeo corrompido → FAILED com mensagem', async () => {
    const prof = await loginAs(app, 'professor');
    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set(authHeader(prof.token))
      .send({ title: 'Proc FAIL' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Corrompido' })
      .expect(201);

    const up = await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${video.body.id}`)
      .set(authHeader(prof.token))
      .attach('file', corruptMp4WithFtyp(), {
        filename: 'bad.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);

    const failed = await waitForStatus(prisma, up.body.id, [
      MediaAssetStatus.FAILED,
    ]);
    expect(failed.errorMessage).toBeTruthy();
  }, 90_000);
});
