import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ContentItemType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';
import { authHeader, loginAs } from './helpers/auth';

describe('Content items (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;

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
    courseId = (
      await prisma.course.findUniqueOrThrow({
        where: { slug: 'programacao-iniciante' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria 3 itens, reordena e GET na nova ordem', async () => {
    const prof = await loginAs(app, 'professor');
    const created = [];
    for (const title of ['A', 'B', 'C']) {
      const res = await request(app.getHttpServer())
        .post(`/courses/${courseId}/content-items`)
        .set(authHeader(prof.token))
        .send({ type: ContentItemType.TEXT, title, body: title })
        .expect(201);
      created.push(res.body);
    }

    const reordered = [created[2].id, created[0].id, created[1].id];
    const list = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/content-items/reorder`)
      .set(authHeader(prof.token))
      .send({ orderedIds: reordered })
      .expect(200);

    const titles = list.body
      .filter((i: { id: string }) => reordered.includes(i.id))
      .map((i: { title: string }) => i.title);
    expect(titles.slice(0, 3)).toEqual(['C', 'A', 'B']);
  });

  it('aluno sem matrícula não acessa conteúdo de outro curso', async () => {
    const gram = await prisma.course.findUniqueOrThrow({
      where: { slug: 'gramatica' },
    });
    const aluno = await loginAs(app, 'aluno');
    await request(app.getHttpServer())
      .get(`/courses/${gram.id}/content-items`)
      .set(authHeader(aluno.token))
      .expect(403);
  });
});
