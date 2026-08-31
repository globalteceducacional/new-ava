import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Admin — usuários (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let institutionId: string;
  let masterToken: string;
  const createdUserIds: string[] = [];

  const unique = () => Date.now() + Math.floor(Math.random() * 1000);

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

    const ifma = await prisma.institution.findUniqueOrThrow({
      where: { slug: 'ifma' },
    });
    institutionId = ifma.id;
    masterToken = (await loginAs(app, 'admin')).token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function createStudent(overrides: Record<string, unknown> = {}) {
    const stamp = unique();
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(authHeader(masterToken))
      .send({
        name: 'Aluno Teste',
        email: `aluno-${stamp}@test.local`,
        username: `aluno_${stamp}`,
        password: SEED_PASSWORD,
        role: 'ALUNO',
        institutionIds: [institutionId],
        ...overrides,
      });
    if (res.status === 201) createdUserIds.push(res.body.id);
    return res;
  }

  it('MASTER cria aluno vinculado à instituição → 201', async () => {
    const res = await createStudent();
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ALUNO');
    expect(res.body.institutions).toHaveLength(1);
    expect(res.body.institutions[0].id).toBe(institutionId);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('usuário criado consegue autenticar com a senha definida', async () => {
    const stamp = unique();
    const created = await createStudent({
      username: `login_${stamp}`,
      email: `login-${stamp}@test.local`,
    });
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: `login_${stamp}`, password: SEED_PASSWORD })
      .expect(200);
  });

  it('e-mail duplicado → 409', async () => {
    const stamp = unique();
    const email = `dup-${stamp}@test.local`;
    await createStudent({ email });
    const second = await createStudent({ email });
    expect(second.status).toBe(409);
  });

  it('papel sem instituição → 400', async () => {
    const res = await createStudent({ institutionIds: [] });
    expect(res.status).toBe(400);
  });

  it('senha curta → 400', async () => {
    const res = await createStudent({ password: '123' });
    expect(res.status).toBe(400);
  });

  it('username fora do padrão → 400', async () => {
    const res = await createStudent({ username: 'Com Espaço' });
    expect(res.status).toBe(400);
  });

  it('bloquear usuário impede o login', async () => {
    const stamp = unique();
    const created = await createStudent({
      username: `block_${stamp}`,
      email: `block-${stamp}@test.local`,
    });
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .patch(`/users/${created.body.id}`)
      .set(authHeader(masterToken))
      .send({ status: 'BLOCKED' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: `block_${stamp}`, password: SEED_PASSWORD })
      .expect(401);
  });

  it('reset de senha invalida a senha anterior', async () => {
    const stamp = unique();
    const created = await createStudent({
      username: `pwd_${stamp}`,
      email: `pwd-${stamp}@test.local`,
    });
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/users/${created.body.id}/password`)
      .set(authHeader(masterToken))
      .send({ password: 'nova-senha-123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: `pwd_${stamp}`, password: SEED_PASSWORD })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: `pwd_${stamp}`, password: 'nova-senha-123' })
      .expect(200);
  });

  it('soft-delete remove o usuário da listagem e do login', async () => {
    const stamp = unique();
    const created = await createStudent({
      username: `del_${stamp}`,
      email: `del-${stamp}@test.local`,
    });
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .delete(`/users/${created.body.id}`)
      .set(authHeader(masterToken))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${created.body.id}`)
      .set(authHeader(masterToken))
      .expect(404);

    const row = await prisma.user.findUnique({
      where: { id: created.body.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('MASTER não pode excluir a própria conta → 400', async () => {
    const me = await loginAs(app, 'admin');
    await request(app.getHttpServer())
      .delete(`/users/${me.user.id}`)
      .set(authHeader(masterToken))
      .expect(400);
  });

  it('filtro por papel devolve apenas o papel pedido', async () => {
    const res = await request(app.getHttpServer())
      .get('/users?role=PROFESSOR&pageSize=100')
      .set(authHeader(masterToken))
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    for (const user of res.body.items) {
      expect(user.role).toBe('PROFESSOR');
    }
  });

  it('PROFESSOR não acessa a gestão de usuários → 403', async () => {
    const prof = await loginAs(app, 'professor');
    await request(app.getHttpServer())
      .get('/users')
      .set(authHeader(prof.token))
      .expect(403);
  });

  it('ALUNO não acessa a gestão de usuários → 403', async () => {
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .get('/users')
      .set(authHeader(aluno.token))
      .expect(403);
  });

  it('ADM_INSTITUICAO não pode criar outro admin master → 403', async () => {
    const admInst = await loginAs(app, 'instituicao');
    const stamp = unique();
    await request(app.getHttpServer())
      .post('/users')
      .set(authHeader(admInst.token))
      .send({
        name: 'Escalada de privilégio',
        email: `escalate-${stamp}@test.local`,
        username: `esc_${stamp}`,
        password: SEED_PASSWORD,
        role: 'ADM_MASTER',
      })
      .expect(403);
  });

  it('ADM_INSTITUICAO só enxerga usuários da própria instituição', async () => {
    const admInst = await loginAs(app, 'instituicao');
    const res = await request(app.getHttpServer())
      .get('/users?pageSize=100')
      .set(authHeader(admInst.token))
      .expect(200);

    for (const user of res.body.items) {
      const ids = user.institutions.map((i: { id: string }) => i.id);
      expect(ids).toContain(institutionId);
    }
  });
});
