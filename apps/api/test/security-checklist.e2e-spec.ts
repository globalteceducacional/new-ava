import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { SEED_PASSWORD } from '../prisma/seed';
import { ALLOWED_VIDEO_MIMES, matchesVideoMagic } from '../src/media/mime.util';
import { hashPassword } from '../src/auth/password.util';
import { LoginProtectionService } from '../src/auth/login-protection.service';

/** Rota só para forçar 500 sem stack na resposta. */
@Controller('__test')
class BoomController {
  @Get('boom')
  boom(): never {
    throw new Error('segredo-interno-nao-deve-vazar');
  }
}

describe('Security checklist (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let protection: LoginProtectionService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    protection = app.get(LoginProtectionService);
    await runSeed();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Argon2id no hash de senha (prefixo $argon2id$)', async () => {
    const hash = await hashPassword('Teste@123456');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('upload: MIME whitelist + magic bytes', () => {
    expect(ALLOWED_VIDEO_MIMES.has('video/mp4')).toBe(true);
    expect(ALLOWED_VIDEO_MIMES.has('text/plain')).toBe(false);
    expect(matchesVideoMagic(Buffer.from('not-a-video'), 'video/mp4')).toBe(
      false,
    );
  });

  it('erro 500 não vaza stack / mensagem interna', async () => {
    const res = await request(app.getHttpServer()).get('/__test/boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/segredo-interno/);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.message).toBe('Erro interno do servidor');
  });

  it('refresh cookie SameSite=Strict + audit de login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'professor', password: SEED_PASSWORD })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('ava_refresh='));
    expect(refresh).toBeTruthy();
    expect(refresh!.toLowerCase()).toMatch(/samesite=strict/);
    expect(refresh!.toLowerCase()).toMatch(/httponly/);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN_SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
  });

  it('tenant: aluno de outra escola sem vínculo do curso → 403', async () => {
    // Órfão (sem instituição) é modo livre e PODE ver cursos publicados.
    // Isolamento de tenant: aluno em escola que NÃO tem o curso vinculado.
    const otherSchool = await prisma.institution.create({
      data: {
        name: `Escola Sec ${Date.now()}`,
        slug: `escola-sec-${Date.now()}`,
      },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'ALUNO' },
    });
    const seedUser = await prisma.user.findFirstOrThrow({
      where: { email: 'aluno@ifma.edu.br' },
    });
    const orphanLogin = `tenant-sec-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email: orphanLogin,
        username: `ten_${Date.now()}`,
        name: 'Tenant other school',
        passwordHash: seedUser.passwordHash,
        roleId: role.id,
      },
    });
    await prisma.institutionMember.create({
      data: {
        userId: user.id,
        institutionId: otherSchool.id,
        roleId: role.id,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: orphanLogin, password: SEED_PASSWORD })
      .expect(200);
    const course = await prisma.course.findUniqueOrThrow({
      where: { slug: 'programacao-iniciante' },
    });
    await request(app.getHttpServer())
      .get(`/courses/${course.id}/modules`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .expect(403);
  });

  it('modo livre: aluno sem instituição vê curso publicado → 200', async () => {
    const orphanLogin = `orphan-sec-${Date.now()}@test.local`;
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'ALUNO' },
    });
    const seedUser = await prisma.user.findFirstOrThrow({
      where: { email: 'aluno@ifma.edu.br' },
    });
    await prisma.user.create({
      data: {
        email: orphanLogin,
        username: `orp_${Date.now()}`,
        name: 'Orphan free',
        passwordHash: seedUser.passwordHash,
        roleId: role.id,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: orphanLogin, password: SEED_PASSWORD })
      .expect(200);
    const course = await prisma.course.findUniqueOrThrow({
      where: { slug: 'programacao-iniciante' },
    });
    await request(app.getHttpServer())
      .get(`/courses/${course.id}/modules`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .expect(200);
  });

  it('soft-delete: usuário deletado não autentica', async () => {
    const email = `softdel-${Date.now()}@test.local`;
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'ALUNO' },
    });
    const seedUser = await prisma.user.findFirstOrThrow({
      where: { email: 'aluno@ifma.edu.br' },
    });
    const u = await prisma.user.create({
      data: {
        email,
        username: `sd_${Date.now()}`,
        name: 'Soft',
        passwordHash: seedUser.passwordHash,
        roleId: role.id,
      },
    });
    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: new Date(), deletedBy: 'test' },
    });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: email, password: SEED_PASSWORD })
      .expect(401);
  });

  it('bloqueio temporário após N falhas (Redis)', async () => {
    process.env.LOGIN_MAX_FAILURES = '3';
    const login = `lockout-${Date.now()}@ifma.edu.br`;
    await protection.clearFailures(login);
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'ALUNO' },
    });
    const seedUser = await prisma.user.findFirstOrThrow({
      where: { email: 'aluno@ifma.edu.br' },
    });
    await prisma.user.create({
      data: {
        email: login,
        username: `lock_${Date.now()}`,
        name: 'Lockout',
        passwordHash: seedUser.passwordHash,
        roleId: role.id,
      },
    });

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login, password: 'errada' });
    }
    const locked = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: SEED_PASSWORD });
    expect(locked.status).toBe(403);
    expect(String(locked.body.message)).toMatch(/bloqueada|temporariamente/i);
    await protection.clearFailures(login);
  });

  // Rate limit 429: auth.e2e-spec.ts | Validação DTO: ValidationPipe global
});
