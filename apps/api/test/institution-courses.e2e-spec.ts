import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { RoleCode } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Institution courses link (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ifmaId: string;
  let ceumaId: string;
  let progIniId: string;
  let progAvId: string;

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

    ifmaId = (
      await prisma.institution.findUniqueOrThrow({ where: { slug: 'ifma' } })
    ).id;
    ceumaId = (
      await prisma.institution.findUniqueOrThrow({ where: { slug: 'ceuma' } })
    ).id;
    progIniId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'programacao-iniciante' },
      })
    ).id;
    progAvId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'programacao-avancado' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('vincular curso matricula alunos ativos do IFMA', async () => {
    const adm = await loginAs(app, 'instituicao');
    // Prog avançado ainda não vinculado no seed
    await request(app.getHttpServer())
      .post(`/institutions/${ifmaId}/courses`)
      .set(authHeader(adm.token))
      .send({ courseIds: [progAvId] })
      .expect(201);

    const alunoRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ALUNO },
    });
    const alunos = await prisma.institutionMember.count({
      where: { institutionId: ifmaId, roleId: alunoRole.id, deletedAt: null },
    });
    const enrollments = await prisma.enrollment.count({
      where: {
        courseId: progAvId,
        institutionId: ifmaId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    expect(enrollments).toBe(alunos);
  });

  it('mesmo curso em CEUMA não duplica Course', async () => {
    const master = await loginAs(app, 'admin');
    const before = await prisma.course.count({
      where: { slug: 'programacao-iniciante' },
    });

    await request(app.getHttpServer())
      .post(`/institutions/${ceumaId}/courses`)
      .set(authHeader(master.token))
      .send({ courseIds: [progIniId] })
      .expect(201);

    const after = await prisma.course.count({
      where: { slug: 'programacao-iniciante' },
    });
    expect(after).toBe(before);

    const links = await prisma.institutionCourse.count({
      where: { courseId: progIniId, active: true },
    });
    expect(links).toBeGreaterThanOrEqual(2);
  });

  it('desvincular desativa vínculo e mantém enrollments', async () => {
    const adm = await loginAs(app, 'instituicao');
    const beforeEnroll = await prisma.enrollment.count({
      where: { courseId: progIniId, institutionId: ifmaId },
    });

    await request(app.getHttpServer())
      .delete(`/institutions/${ifmaId}/courses/${progIniId}`)
      .set(authHeader(adm.token))
      .expect(200);

    const link = await prisma.institutionCourse.findUniqueOrThrow({
      where: {
        institutionId_courseId: { institutionId: ifmaId, courseId: progIniId },
      },
    });
    expect(link.active).toBe(false);

    const afterEnroll = await prisma.enrollment.count({
      where: { courseId: progIniId, institutionId: ifmaId },
    });
    expect(afterEnroll).toBe(beforeEnroll);

    // reativa para não quebrar outros testes
    await request(app.getHttpServer())
      .post(`/institutions/${ifmaId}/courses`)
      .set(authHeader(adm.token))
      .send({ courseIds: [progIniId] })
      .expect(201);
  });

  it('ADM IFMA vinculando à CEUMA → 403', async () => {
    const adm = await loginAs(app, 'instituicao');
    await request(app.getHttpServer())
      .post(`/institutions/${ceumaId}/courses`)
      .set(authHeader(adm.token))
      .send({ courseIds: [progIniId] })
      .expect(403);
  });
});
