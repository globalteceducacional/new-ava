import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';

async function loginAs(
  app: INestApplication<App>,
  login: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ login, password: SEED_PASSWORD })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

describe('Guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ifmaId: string;
  let otherId: string;

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

    const ifma = await prisma.institution.findUniqueOrThrow({
      where: { slug: 'ifma' },
    });
    ifmaId = ifma.id;

    const other = await prisma.institution.upsert({
      where: { slug: 'ceuma' },
      create: { name: 'CEUMA', slug: 'ceuma', status: 'ACTIVE' },
      update: { deletedAt: null },
    });
    otherId = other.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rota protegida sem token → 401', async () => {
    await request(app.getHttpServer())
      .get(`/institutions/${ifmaId}/ping`)
      .expect(401);
  });

  it('ALUNO sem role permitida em rota só de admin (simulado via Roles) → 403 em escopo cruzado', async () => {
    const token = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .get(`/institutions/${otherId}/ping`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('ADM_MASTER acessa instituição arbitrária → 200', async () => {
    const token = await loginAs(app, 'admin');
    await request(app.getHttpServer())
      .get(`/institutions/${otherId}/ping`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('ADM_INSTITUICAO do IFMA acessando outra instituição → 403', async () => {
    const token = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .get(`/institutions/${otherId}/ping`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('ADM_INSTITUICAO do IFMA acessando IFMA → 200', async () => {
    const token = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .get(`/institutions/${ifmaId}/ping`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
