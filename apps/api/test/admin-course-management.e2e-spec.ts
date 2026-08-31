import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_PASSWORD } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

/**
 * Cobre o caminho que o admin percorre na interface:
 * criar instituição → criar aluno → criar curso → publicar →
 * vincular à instituição → matricular → aluno enxerga o curso.
 */
describe('Admin — gestão de curso ponta a ponta (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterToken: string;
  let categoryId: string;

  let institutionId: string;
  let studentId: string;
  let studentLogin: string;
  let courseId: string;

  const stamp = Date.now();

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
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: 'programacao' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (courseId) await prisma.course.deleteMany({ where: { id: courseId } });
    if (studentId) await prisma.user.deleteMany({ where: { id: studentId } });
    if (institutionId) {
      await prisma.institution.deleteMany({ where: { id: institutionId } });
    }
    await app.close();
  });

  it('cria a instituição', async () => {
    const res = await request(app.getHttpServer())
      .post('/institutions')
      .set(authHeader(masterToken))
      .send({ name: `Inst Teste ${stamp}` })
      .expect(201);
    institutionId = res.body.id;
  });

  it('cria o aluno na instituição', async () => {
    studentLogin = `turma_${stamp}`;
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(authHeader(masterToken))
      .send({
        name: 'Aluno da Turma',
        email: `turma-${stamp}@test.local`,
        username: studentLogin,
        password: SEED_PASSWORD,
        role: 'ALUNO',
        institutionIds: [institutionId],
      })
      .expect(201);
    studentId = res.body.id;
  });

  it('cria o curso como rascunho e publica', async () => {
    const created = await request(app.getHttpServer())
      .post('/courses')
      .set(authHeader(masterToken))
      .send({ title: `Curso Teste ${stamp}`, categoryIds: [categoryId] })
      .expect(201);
    courseId = created.body.id;
    expect(created.body.status).toBe('DRAFT');

    const published = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/publish`)
      .set(authHeader(masterToken))
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');
  });

  it('matricular antes de vincular a instituição → 400 com orientação', async () => {
    const res = await request(app.getHttpServer())
      .post(`/courses/${courseId}/enrollments`)
      .set(authHeader(masterToken))
      .send({ studentUserId: studentId })
      .expect(400);
    expect(String(res.body.message)).toContain('Vincule o curso');
  });

  it('vincular o curso matricula os alunos da instituição', async () => {
    const res = await request(app.getHttpServer())
      .post(`/institutions/${institutionId}/courses`)
      .set(authHeader(masterToken))
      .send({ courseIds: [courseId] })
      .expect(201);
    expect(res.body.studentCount).toBe(1);

    const enrollments = await request(app.getHttpServer())
      .get(`/courses/${courseId}/enrollments`)
      .set(authHeader(masterToken))
      .expect(200);
    expect(enrollments.body).toHaveLength(1);
    expect(enrollments.body[0].user.id).toBe(studentId);
  });

  it('o aluno enxerga o curso na grade (/courses/curriculum)', async () => {
    // Vínculo instituição→curso cria matrícula ASSIGNED (grade), não SELF (mine).
    const student = await loginAs(app, studentLogin);
    const res = await request(app.getHttpServer())
      .get('/courses/curriculum')
      .set(authHeader(student.token))
      .expect(200);

    const ids = res.body.map(
      (item: { course: { id: string } }) => item.course.id,
    );
    expect(ids).toContain(courseId);
  });

  it('atribui e remove professor do curso', async () => {
    const professor = await prisma.user.findFirstOrThrow({
      where: { username: 'professor' },
    });

    await request(app.getHttpServer())
      .post(`/courses/${courseId}/teachers`)
      .set(authHeader(masterToken))
      .send({ teacherUserId: professor.id })
      .expect(201);

    const withTeacher = await request(app.getHttpServer())
      .get(`/courses/${courseId}/teachers`)
      .set(authHeader(masterToken))
      .expect(200);
    expect(withTeacher.body).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/courses/${courseId}/teachers/${professor.id}`)
      .set(authHeader(masterToken))
      .expect(200);

    const withoutTeacher = await request(app.getHttpServer())
      .get(`/courses/${courseId}/teachers`)
      .set(authHeader(masterToken))
      .expect(200);
    expect(withoutTeacher.body).toHaveLength(0);
  });

  it('atribuir aluno como professor → 400', async () => {
    await request(app.getHttpServer())
      .post(`/courses/${courseId}/teachers`)
      .set(authHeader(masterToken))
      .send({ teacherUserId: studentId })
      .expect(400);
  });

  it('remove a matrícula e o curso some para o aluno', async () => {
    await request(app.getHttpServer())
      .delete(`/courses/${courseId}/enrollments/${studentId}`)
      .set(authHeader(masterToken))
      .expect(200);

    const student = await loginAs(app, studentLogin);
    const res = await request(app.getHttpServer())
      .get('/courses/mine')
      .set(authHeader(student.token))
      .expect(200);

    const ids = res.body.map(
      (item: { course: { id: string } }) => item.course.id,
    );
    expect(ids).not.toContain(courseId);
  });

  it('despublicar tira o curso da visão do aluno', async () => {
    await request(app.getHttpServer())
      .post(`/institutions/${institutionId}/courses`)
      .set(authHeader(masterToken))
      .send({ courseIds: [courseId] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/courses/${courseId}/unpublish`)
      .set(authHeader(masterToken))
      .expect(200);

    const student = await loginAs(app, studentLogin);
    const res = await request(app.getHttpServer())
      .get('/courses/mine')
      .set(authHeader(student.token))
      .expect(200);

    const ids = res.body.map(
      (item: { course: { id: string } }) => item.course.id,
    );
    expect(ids).not.toContain(courseId);
  });
});
