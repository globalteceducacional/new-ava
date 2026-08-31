import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../prisma/seed';

describe('Catalog seed (e2e)', () => {
  let app: INestApplication;
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

  it('cursos de Programação são registros distintos na mesma categoria', async () => {
    const prog = await prisma.category.findUniqueOrThrow({
      where: { slug: 'programacao' },
    });
    const courses = await prisma.course.findMany({
      where: {
        deletedAt: null,
        categories: { some: { categoryId: prog.id } },
      },
      include: { categories: true },
    });

    const titles = courses.map((c) => c.title).sort();
    expect(titles).toEqual(
      expect.arrayContaining([
        'Programação — Iniciante',
        'Programação — Avançado',
      ]),
    );
    expect(courses.length).toBeGreaterThanOrEqual(2);
    const ini = courses.find((c) => c.title === 'Programação — Iniciante');
    const av = courses.find((c) => c.title === 'Programação — Avançado');
    expect(ini?.id).toBeDefined();
    expect(av?.id).toBeDefined();
    expect(ini!.id).not.toBe(av!.id);
    for (const c of [ini!, av!]) {
      expect(c.categories.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Course não tem institutionId — vínculo só via InstitutionCourse', async () => {
    const course = await prisma.course.findFirstOrThrow({
      where: { slug: 'programacao-iniciante' },
    });
    expect(Object.keys(course)).not.toContain('institutionId');

    const links = await prisma.institutionCourse.findMany({
      where: { courseId: course.id, active: true },
    });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
