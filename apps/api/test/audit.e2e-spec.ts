import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';

describe('Audit login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('login falho gera LOGIN_FAIL', async () => {
    const before = await prisma.auditLog.count({
      where: { action: AuditAction.LOGIN_FAIL },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'aluno', password: 'errada' })
      .expect(401);

    const after = await prisma.auditLog.count({
      where: { action: AuditAction.LOGIN_FAIL },
    });
    expect(after).toBeGreaterThan(before);
  });

  it('login ok gera LOGIN_SUCCESS', async () => {
    const before = await prisma.auditLog.count({
      where: { action: AuditAction.LOGIN_SUCCESS },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'aluno', password: SEED_PASSWORD })
      .expect(200);

    const after = await prisma.auditLog.count({
      where: { action: AuditAction.LOGIN_SUCCESS },
    });
    expect(after).toBeGreaterThan(before);
  });
});
