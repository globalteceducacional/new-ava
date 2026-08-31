import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { RoleCode } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';

describe('Seed (e2e)', () => {
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

  it('cria usuários seed com os 4 roles', async () => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { email: 'asc' },
    });

    const byUsername = Object.fromEntries(users.map((u) => [u.username, u]));
    expect(byUsername['admin']?.role.code).toBe(RoleCode.ADM_MASTER);
    expect(byUsername['instituicao']?.role.code).toBe(RoleCode.ADM_INSTITUICAO);
    expect(byUsername['professor']?.role.code).toBe(RoleCode.PROFESSOR);
    expect(byUsername['aluno']?.role.code).toBe(RoleCode.ALUNO);

    const codes = new Set(users.map((u) => u.role.code));
    expect(codes.has(RoleCode.ADM_MASTER)).toBe(true);
    expect(codes.has(RoleCode.ADM_INSTITUICAO)).toBe(true);
    expect(codes.has(RoleCode.PROFESSOR)).toBe(true);
    expect(codes.has(RoleCode.ALUNO)).toBe(true);
  });

  it('vincula IFMA aos perfis não-master', async () => {
    const institution = await prisma.institution.findUnique({
      where: { slug: 'ifma' },
    });
    expect(institution).toBeTruthy();

    const members = await prisma.institutionMember.findMany({
      where: { institutionId: institution!.id, deletedAt: null },
      include: { role: true },
    });
    expect(members.length).toBeGreaterThanOrEqual(3);
    const codes = new Set(members.map((m) => m.role.code));
    expect(codes.has(RoleCode.ADM_INSTITUICAO)).toBe(true);
    expect(codes.has(RoleCode.PROFESSOR)).toBe(true);
    expect(codes.has(RoleCode.ALUNO)).toBe(true);
  });

  it('senha seed é utilizável (smoke via login)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'aluno', password: SEED_PASSWORD })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({ role: RoleCode.ALUNO }),
      }),
    );
  });
});
