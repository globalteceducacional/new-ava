/**
 * Remove resíduos deixados pelos testes e2e no banco de desenvolvimento.
 *
 * Os specs criam registros com sufixo de timestamp (`Date.now()`), o que polui
 * o catálogo visto no navegador. Este script apaga fisicamente apenas o que
 * casa com esses padrões — dados do seed e criados na UI não são tocados.
 *
 * Uso: npm run db:clean-tests
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Sufixo de timestamp: Date.now() em ms (13) ou unix em segundos (10). */
const TIMESTAMP = String.raw`\d{10,13}`;

const COURSE_PATTERNS = [
  new RegExp(`^Curso Prof ${TIMESTAMP}$`),
  new RegExp(`^Curso Master ${TIMESTAMP}$`),
  new RegExp(`^Soft Del ${TIMESTAMP}$`),
  new RegExp(`^Ciclo ${TIMESTAMP}$`),
  new RegExp(`^Curso (E2E|Teste|Smoke|Editor) ${TIMESTAMP}$`),
];

const CATEGORY_PATTERNS = [
  new RegExp(`^Cat (Aluno|Prof|Master) ${TIMESTAMP}$`),
  new RegExp(`^Categoria (Teste|E2E) ${TIMESTAMP}$`),
];

const USER_EMAIL_PATTERNS = [
  /@test\.local$/i,
  // security-checklist cria o usuário de lockout no domínio real da instituição.
  new RegExp(`^lockout-${TIMESTAMP}@`, 'i'),
];

const USER_USERNAME_PATTERNS = [
  new RegExp(`^(lock|sd|orp|orphan_play)_${TIMESTAMP}$`, 'i'),
];

const INSTITUTION_PATTERNS = [
  new RegExp(`^(Inst|Instituição) (E2E|Teste) ${TIMESTAMP}$`),
  new RegExp(`^Escola Smoke ${TIMESTAMP}$`),
  new RegExp(`^Colégio Alfa Beta$`),
];

function matches(value: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(value));
}

async function main() {
  const [courses, categories, users, institutions] = await Promise.all([
    prisma.course.findMany({ select: { id: true, title: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, email: true, username: true } }),
    prisma.institution.findMany({ select: { id: true, name: true } }),
  ]);

  const courseIds = courses
    .filter((c) => matches(c.title, COURSE_PATTERNS))
    .map((c) => c.id);
  const categoryIds = categories
    .filter((c) => matches(c.name, CATEGORY_PATTERNS))
    .map((c) => c.id);
  const userIds = users
    .filter(
      (u) =>
        matches(u.email, USER_EMAIL_PATTERNS) ||
        matches(u.username, USER_USERNAME_PATTERNS),
    )
    .map((u) => u.id);
  const institutionIds = institutions
    .filter((i) => matches(i.name, INSTITUTION_PATTERNS))
    .map((i) => i.id);

  // onDelete: Cascade cuida de matrículas, módulos, conteúdos e vínculos.
  const [deletedCourses, deletedCategories, deletedUsers, deletedInstitutions] =
    await prisma.$transaction([
      prisma.course.deleteMany({ where: { id: { in: courseIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.institution.deleteMany({ where: { id: { in: institutionIds } } }),
    ]);

  console.log('Limpeza de dados de teste concluída:');
  console.log(`  cursos:        ${deletedCourses.count}`);
  console.log(`  categorias:    ${deletedCategories.count}`);
  console.log(`  usuários:      ${deletedUsers.count}`);
  console.log(`  instituições:  ${deletedInstitutions.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
