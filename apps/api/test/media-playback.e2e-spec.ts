import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { MediaAssetStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';
import { ensureTinyMp4Fixture } from './helpers/media-fixture';

async function waitReady(prisma: PrismaService, id: string) {
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const a = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    if (a.status === MediaAssetStatus.READY) return a;
    if (a.status === MediaAssetStatus.FAILED) {
      throw new Error(`Media FAILED: ${a.errorMessage}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timeout READY');
}

describe('Media playback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let courseId: string;
  let mediaId: string;
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
    jwt = app.get(JwtService);
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
      .send({ title: 'Playback' })
      .expect(201);
    const video = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules/${mod.body.id}/videos`)
      .set(authHeader(prof.token))
      .send({ title: 'Aula play' })
      .expect(201);
    const up = await request(app.getHttpServer())
      .post(`/media/upload?moduleVideoId=${video.body.id}`)
      .set(authHeader(prof.token))
      .attach('file', readFileSync(tinyPath), {
        filename: 'tiny.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);
    await waitReady(prisma, up.body.id);
    mediaId = up.body.id;
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  it('usuário de outra escola sem o curso → 403', async () => {
    // Sem instituição = modo livre (pode assistir). 403 = escola sem vínculo do curso.
    const otherSchool = await prisma.institution.create({
      data: {
        name: `Escola Play ${Date.now()}`,
        slug: `escola-play-${Date.now()}`,
      },
    });
    const alunoRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'ALUNO' },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `outsider-play-${Date.now()}@test.local`,
        username: `out_play_${Date.now()}`,
        name: 'Outsider school',
        passwordHash: (
          await prisma.user.findFirstOrThrow({
            where: { email: 'aluno@ifma.edu.br' },
          })
        ).passwordHash,
        roleId: alunoRole.id,
      },
    });
    await prisma.institutionMember.create({
      data: {
        userId: outsider.id,
        institutionId: otherSchool.id,
        roleId: alunoRole.id,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: outsider.email, password: SEED_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/media/${mediaId}/playback`)
      .set(authHeader(login.body.accessToken))
      .expect(403);
  });

  it('aluno matriculado recebe playlistUrl', async () => {
    const aluno = await loginAs(app, 'aluno');
    const res = await request(app.getHttpServer())
      .get(`/media/${mediaId}/playback`)
      .set(authHeader(aluno.token))
      .expect(200);
    expect(res.body.playlistUrl).toContain(`/media/${mediaId}/hls/`);
    expect(res.body.token).toBeTruthy();

    const stream = await request(app.getHttpServer())
      .get(res.body.playlistUrl)
      .expect(200);
    expect(stream.text).toContain('#EXTM3U');
  });

  it('token expirado → acesso negado', async () => {
    const token = await jwt.signAsync(
      { sub: 'x', mediaId, typ: 'media' },
      { expiresIn: '1ms' },
    );
    await new Promise((r) => setTimeout(r, 20));
    await request(app.getHttpServer())
      .get(
        `/media/${mediaId}/hls/index.m3u8?token=${encodeURIComponent(token)}`,
      )
      .expect(400);
  });
});
