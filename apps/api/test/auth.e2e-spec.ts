import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

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
    await runSeed();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login válido → 200 + cookie refresh + access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'professor', password: SEED_PASSWORD })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('ava_refresh=')]),
    );
  });

  it('login senha errada → 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'professor', password: 'errada' })
      .expect(401);
  });

  it('refresh com cookie válido → novo access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'instituicao', password: SEED_PASSWORD })
      .expect(200);

    const cookies = login.headers['set-cookie'] as unknown as string[];
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
  });

  it('logout revoga refresh (refresh subsequente → 401)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'admin', password: SEED_PASSWORD })
      .expect(200);

    const cookies = login.headers['set-cookie'] as unknown as string[];

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookies)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);
  });

  it('rate limit no login após excesso de tentativas → 429', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          login: `ratelimit-${Date.now()}-${i}@test.local`,
          password: 'x',
        });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
