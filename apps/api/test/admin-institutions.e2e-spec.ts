import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Admin — instituições e painel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterToken: string;
  const createdInstitutionIds: string[] = [];

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
    masterToken = (await loginAs(app, 'admin')).token;
  });

  afterAll(async () => {
    await prisma.institution.deleteMany({
      where: { id: { in: createdInstitutionIds } },
    });
    await app.close();
  });

  async function createInstitution(body: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/institutions')
      .set(authHeader(masterToken))
      .send({ name: `Inst Teste ${unique()}`, ...body });
    if (res.status === 201) createdInstitutionIds.push(res.body.id);
    return res;
  }

  it('MASTER cria instituição derivando o slug do nome → 201', async () => {
    const res = await createInstitution({ name: 'Colégio Alfa Beta' });
    expect(res.status).toBe(201);
    expect(res.body.slug).toMatch(/^colegio-alfa-beta/);
    expect(res.body.memberCount).toBe(0);
  });

  it('slug explícito duplicado → 409', async () => {
    const slug = `dup-${unique()}`;
    await createInstitution({ slug });
    const second = await createInstitution({ slug });
    expect(second.status).toBe(409);
  });

  it('atualiza nome → 200', async () => {
    const created = await createInstitution();
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .patch(`/institutions/${created.body.id}`)
      .set(authHeader(masterToken))
      .send({ name: 'Nome Atualizado' })
      .expect(200);

    expect(res.body.name).toBe('Nome Atualizado');
  });

  it('exclusão bloqueada quando há membros vinculados → 400', async () => {
    const ifma = await prisma.institution.findUniqueOrThrow({
      where: { slug: 'ifma' },
    });
    await request(app.getHttpServer())
      .delete(`/institutions/${ifma.id}`)
      .set(authHeader(masterToken))
      .expect(400);
  });

  it('exclui instituição vazia → soft-delete', async () => {
    const created = await createInstitution();
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .delete(`/institutions/${created.body.id}`)
      .set(authHeader(masterToken))
      .expect(200);

    const row = await prisma.institution.findUnique({
      where: { id: created.body.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('ADM_INSTITUICAO não pode criar instituição → 403', async () => {
    const admInst = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .post('/institutions')
      .set(authHeader(admInst.token))
      .send({ name: `Inst Teste ${unique()}` })
      .expect(403);
  });

  it('ADM_INSTITUICAO não altera slug da própria instituição → 403', async () => {
    const admInst = await loginAs(app, 'instituicao');
    const ifma = await prisma.institution.findUniqueOrThrow({
      where: { slug: 'ifma' },
    });
    await request(app.getHttpServer())
      .patch(`/institutions/${ifma.id}`)
      .set(authHeader(admInst.token))
      .send({ slug: 'ifma-hack' })
      .expect(403);
  });

  it('GET /admin/overview devolve contagens consistentes', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/overview')
      .set(authHeader(masterToken))
      .expect(200);

    expect(res.body.institutions).toBeGreaterThan(0);
    expect(res.body.students).toBeGreaterThan(0);
    expect(res.body.courses.total).toBeGreaterThanOrEqual(
      res.body.courses.published,
    );
  });

  it('GET /admin/audit devolve página com eventos de login', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/audit?action=LOGIN_SUCCESS&pageSize=5')
      .set(authHeader(masterToken))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.pageSize).toBe(5);
    for (const item of res.body.items) {
      expect(item.action).toBe('LOGIN_SUCCESS');
    }
  });

  it('ALUNO não acessa o painel administrativo → 403', async () => {
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .get('/admin/overview')
      .set(authHeader(aluno.token))
      .expect(403);
  });
});
