import * as argon2 from 'argon2';
import {
  ContentItemType,
  CourseStatus,
  EnrollmentSource,
  EnrollmentStatus,
  ModuleMaterialType,
  PrismaClient,
  QuestionType,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
} from '../src/auth/permissions.constants';
import { slugify } from '../src/common/slugify';

const prisma = new PrismaClient();

/** Senha padrão do seed local (sobrescreva com SEED_PASSWORD no .env). */
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? '123456';

const ROLE_DEFS: Array<{ code: RoleCode; name: string; description: string }> =
  [
    {
      code: RoleCode.ADM_MASTER,
      name: 'Administrador Master',
      description: 'Superusuário global — bypass de escopo',
    },
    {
      code: RoleCode.ADM_INSTITUICAO,
      name: 'Administrador da Instituição',
      description: 'Gestão da instituição e vínculo de cursos',
    },
    {
      code: RoleCode.PROFESSOR,
      name: 'Professor',
      description: 'Cria/edita cursos do catálogo e conteúdos atribuídos',
    },
    {
      code: RoleCode.ALUNO,
      name: 'Aluno',
      description: 'Consome cursos matriculados',
    },
  ];

async function upsertRoles() {
  const roles = {} as Record<RoleCode, { id: string; code: RoleCode }>;
  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      create: def,
      update: { name: def.name, description: def.description, deletedAt: null },
    });
    roles[def.code] = role;
  }
  return roles;
}

async function upsertPermissions() {
  const byCode: Record<string, { id: string; code: string }> = {};
  for (const def of PERMISSION_DEFINITIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: def.code },
      create: def,
      update: {
        module: def.module,
        description: def.description,
        deletedAt: null,
      },
    });
    byCode[def.code] = perm;
  }
  return byCode;
}

async function syncRolePermissions(
  roles: Record<RoleCode, { id: string; code: RoleCode }>,
  permissions: Record<string, { id: string; code: string }>,
) {
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = roles[roleCode as RoleCode];
    for (const code of codes) {
      const permission = permissions[code];
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

/** Upsert por email/username (migra logins antigos do seed). */
async function upsertUser(input: {
  email: string;
  username: string;
  name: string;
  roleId: string;
  passwordHash: string;
  legacyEmails?: string[];
  legacyUsernames?: string[];
}) {
  const existing = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { email: input.email },
        { username: input.username },
        ...(input.legacyEmails ?? []).map((email) => ({ email })),
        ...(input.legacyUsernames ?? []).map((username) => ({ username })),
      ],
    },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email: input.email,
        username: input.username,
        name: input.name,
        roleId: input.roleId,
        passwordHash: input.passwordHash,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      name: input.name,
      roleId: input.roleId,
      passwordHash: input.passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
}

async function upsertCategory(name: string) {
  const slug = slugify(name);
  return prisma.category.upsert({
    where: { slug },
    create: { name, slug },
    update: { name, deletedAt: null },
  });
}

async function upsertCourse(input: {
  title: string;
  synopsis: string;
  categoryIds: string[];
  status?: CourseStatus;
  teacherId?: string;
}) {
  const slug = slugify(input.title);
  const course = await prisma.course.upsert({
    where: { slug },
    create: {
      title: input.title,
      slug,
      synopsis: input.synopsis,
      status: input.status ?? CourseStatus.PUBLISHED,
    },
    update: {
      title: input.title,
      synopsis: input.synopsis,
      status: input.status ?? CourseStatus.PUBLISHED,
      deletedAt: null,
    },
  });

  for (const categoryId of input.categoryIds) {
    await prisma.courseCategory.upsert({
      where: {
        courseId_categoryId: { courseId: course.id, categoryId },
      },
      create: { courseId: course.id, categoryId },
      update: {},
    });
  }

  if (input.teacherId) {
    await prisma.courseTeacher.upsert({
      where: {
        courseId_userId: { courseId: course.id, userId: input.teacherId },
      },
      create: { courseId: course.id, userId: input.teacherId },
      update: { deletedAt: null },
    });
  }

  return course;
}

async function linkCourseAndEnrollStudents(
  institutionId: string,
  courseId: string,
  alunoRoleId: string,
) {
  await prisma.institutionCourse.upsert({
    where: {
      institutionId_courseId: { institutionId, courseId },
    },
    create: { institutionId, courseId, active: true },
    update: { active: true, deletedAt: null },
  });

  const alunos = await prisma.institutionMember.findMany({
    where: {
      institutionId,
      roleId: alunoRoleId,
      deletedAt: null,
      user: { status: UserStatus.ACTIVE, deletedAt: null },
    },
  });

  for (const aluno of alunos) {
    await prisma.enrollment.upsert({
      where: {
        courseId_userId_institutionId: {
          courseId,
          userId: aluno.userId,
          institutionId,
        },
      },
      create: {
        courseId,
        userId: aluno.userId,
        institutionId,
        status: EnrollmentStatus.ACTIVE,
        source: EnrollmentSource.ASSIGNED,
      },
      update: {
        status: EnrollmentStatus.ACTIVE,
        source: EnrollmentSource.ASSIGNED,
        deletedAt: null,
      },
    });
  }
}

/** Conteúdo visualizável (texto, links, módulo, atividade, quiz) — sem vídeo. */
async function seedCoursePedagogy(
  courseId: string,
  createdBy: string,
  flavor: 'prog' | 'mat',
) {
  const texts =
    flavor === 'prog'
      ? {
          welcomeTitle: 'Boas-vindas ao curso',
          welcomeBody:
            'Neste curso você verá lógica de programação, variáveis e condicionais. Use os materiais e a atividade abaixo.',
          linkTitle: 'Documentação MDN — JavaScript',
          linkUrl: 'https://developer.mozilla.org/pt-BR/docs/Web/JavaScript',
          moduleTitle: 'Módulo 1 — Fundamentos',
          videoTitle: 'Aula 1 — Visão geral (sem vídeo ainda)',
          activityTitle: 'Atividade: descreva um algoritmo',
          activityDesc:
            'Em até 1 parágrafo, descreva um algoritmo do dia a dia (ex.: fazer café).',
          quizTitle: 'Quiz rápido — conceitos',
          q1: 'O que é uma variável?',
          q1ok: 'Um espaço nomeado para guardar um valor',
          q1bad: 'Um tipo de loop',
        }
      : {
          welcomeTitle: 'Boas-vindas à Matemática Básica',
          welcomeBody:
            'Revise aritmética e álgebra elementar. Materiais e exercícios estão listados no curso.',
          linkTitle: 'Khan Academy — Álgebra',
          linkUrl: 'https://pt.khanacademy.org/math/algebra',
          moduleTitle: 'Módulo 1 — Números e operações',
          videoTitle: 'Aula 1 — Introdução (sem vídeo ainda)',
          activityTitle: 'Atividade: resolva 2 + 2',
          activityDesc: 'Explique com suas palavras por que 2+2=4.',
          quizTitle: 'Quiz rápido — aritmética',
          q1: 'Quanto é 7 × 8?',
          q1ok: '56',
          q1bad: '54',
        };

  const existingWelcome = await prisma.contentItem.findFirst({
    where: { courseId, title: texts.welcomeTitle, deletedAt: null },
  });
  if (!existingWelcome) {
    await prisma.contentItem.createMany({
      data: [
        {
          courseId,
          type: ContentItemType.TEXT,
          title: texts.welcomeTitle,
          body: texts.welcomeBody,
          sortOrder: 0,
          createdBy,
        },
        {
          courseId,
          type: ContentItemType.LINK,
          title: texts.linkTitle,
          url: texts.linkUrl,
          sortOrder: 1,
          createdBy,
        },
        {
          courseId,
          type: ContentItemType.TEXT,
          title: 'Como estudar neste AVA',
          body: '1) Leia os conteúdos\n2) Faça a atividade\n3) Responda o quiz\n4) Participe da comunidade',
          sortOrder: 2,
          createdBy,
        },
      ],
    });
  }

  let mod = await prisma.courseModule.findFirst({
    where: { courseId, title: texts.moduleTitle, deletedAt: null },
  });
  if (!mod) {
    mod = await prisma.courseModule.create({
      data: {
        courseId,
        title: texts.moduleTitle,
        description: 'Playlist inicial para navegação local',
        sortOrder: 0,
        createdBy,
      },
    });
  }

  let video = await prisma.moduleVideo.findFirst({
    where: { moduleId: mod.id, title: texts.videoTitle, deletedAt: null },
  });
  if (!video) {
    video = await prisma.moduleVideo.create({
      data: {
        moduleId: mod.id,
        title: texts.videoTitle,
        description:
          'Placeholder — upload de mídia na Fase 4 / editor do professor',
        sortOrder: 0,
        createdBy,
      },
    });
    await prisma.moduleVideoMaterial.create({
      data: {
        moduleVideoId: video.id,
        type: ModuleMaterialType.LINK,
        title: 'Material de apoio',
        url: texts.linkUrl,
        sortOrder: 0,
        createdBy,
      },
    });
  }

  const existingActivity = await prisma.activity.findFirst({
    where: { courseId, title: texts.activityTitle, deletedAt: null },
  });
  if (!existingActivity) {
    await prisma.activity.create({
      data: {
        courseId,
        moduleId: mod.id,
        title: texts.activityTitle,
        description: texts.activityDesc,
        allowLate: true,
        rubric: [
          { key: 'clareza', label: 'Clareza', weight: 0.5 },
          { key: 'completude', label: 'Completude', weight: 0.5 },
        ],
        createdBy,
      },
    });
  } else if (!existingActivity.moduleId) {
    await prisma.activity.update({
      where: { id: existingActivity.id },
      data: { moduleId: mod.id },
    });
  }

  const existingQuiz = await prisma.quiz.findFirst({
    where: { courseId, title: texts.quizTitle, deletedAt: null },
    include: { _count: { select: { questions: true } } },
  });
  if (!existingQuiz) {
    const quiz = await prisma.quiz.create({
      data: {
        courseId,
        moduleId: mod.id,
        title: texts.quizTitle,
        description: 'Uma questão para validar o fluxo local',
        maxAttempts: 3,
        graded: true,
        createdBy,
      },
    });
    const question = await prisma.question.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.MCQ,
        text: texts.q1,
        points: 1,
        sortOrder: 0,
      },
    });
    await prisma.questionOption.createMany({
      data: [
        {
          questionId: question.id,
          text: texts.q1ok,
          isCorrect: true,
          sortOrder: 0,
        },
        {
          questionId: question.id,
          text: texts.q1bad,
          isCorrect: false,
          sortOrder: 1,
        },
      ],
    });
  } else {
    if (!existingQuiz.moduleId) {
      await prisma.quiz.update({
        where: { id: existingQuiz.id },
        data: { moduleId: mod.id },
      });
    }
    if (existingQuiz._count.questions === 0) {
      const question = await prisma.question.create({
        data: {
          quizId: existingQuiz.id,
          type: QuestionType.MCQ,
          text: texts.q1,
          points: 1,
          sortOrder: 0,
        },
      });
      await prisma.questionOption.createMany({
        data: [
          {
            questionId: question.id,
            text: texts.q1ok,
            isCorrect: true,
            sortOrder: 0,
          },
          {
            questionId: question.id,
            text: texts.q1bad,
            isCorrect: false,
            sortOrder: 1,
          },
        ],
      });
    }
  }

  const existingTopic = await prisma.communityTopic.findFirst({
    where: { courseId, title: 'Dúvidas do módulo 1', deletedAt: null },
  });
  if (!existingTopic) {
    await prisma.communityTopic.create({
      data: {
        courseId,
        title: 'Dúvidas do módulo 1',
        body: 'Usem este tópico para perguntas sobre o conteúdo inicial.',
        authorId: createdBy,
        moduleId: mod.id,
        moduleVideoId: video.id,
      },
    });
  }
}

export async function runSeed() {
  const passwordHash = await argon2.hash(SEED_PASSWORD, {
    type: argon2.argon2id,
  });

  const roles = await upsertRoles();
  const permissions = await upsertPermissions();
  await syncRolePermissions(roles, permissions);

  const institution = await prisma.institution.upsert({
    where: { slug: 'ifma' },
    create: {
      name: 'IFMA — Instituto Federal do Maranhão',
      slug: 'ifma',
      status: 'ACTIVE',
    },
    update: {
      name: 'IFMA — Instituto Federal do Maranhão',
      status: 'ACTIVE',
      deletedAt: null,
    },
  });

  const ceuma = await prisma.institution.upsert({
    where: { slug: 'ceuma' },
    create: { name: 'CEUMA', slug: 'ceuma', status: 'ACTIVE' },
    update: { name: 'CEUMA', status: 'ACTIVE', deletedAt: null },
  });

  await prisma.institution.upsert({
    where: { slug: 'ava-aberto' },
    create: {
      name: 'AVA Aberto',
      slug: 'ava-aberto',
      status: 'ACTIVE',
    },
    update: { name: 'AVA Aberto', status: 'ACTIVE', deletedAt: null },
  });

  const master = await upsertUser({
    email: 'admin@ava.local',
    username: 'admin',
    name: 'Administrador Master',
    roleId: roles.ADM_MASTER.id,
    passwordHash,
    legacyEmails: ['master@ava.local'],
    legacyUsernames: ['adm.master'],
  });

  const admInst = await upsertUser({
    email: 'instituicao@ifma.edu.br',
    username: 'instituicao',
    name: 'Admin da Instituição',
    roleId: roles.ADM_INSTITUICAO.id,
    passwordHash,
    legacyEmails: ['adm@ifma.edu.br'],
    legacyUsernames: ['adm.ifma'],
  });

  const professor = await upsertUser({
    email: 'professor@ifma.edu.br',
    username: 'professor',
    name: 'Professor IFMA',
    roleId: roles.PROFESSOR.id,
    passwordHash,
    legacyUsernames: ['prof.ifma'],
  });

  const aluno = await upsertUser({
    email: 'aluno@ifma.edu.br',
    username: 'aluno',
    name: 'Aluno IFMA',
    roleId: roles.ALUNO.id,
    passwordHash,
    legacyUsernames: ['aluno.ifma'],
  });

  // Elenco extra para o painel do admin ter volume real de gestão.
  const professora = await upsertUser({
    email: 'marina.souza@ifma.edu.br',
    username: 'marina.souza',
    name: 'Marina Souza',
    roleId: roles.PROFESSOR.id,
    passwordHash,
  });

  const alunosExtras = await Promise.all(
    [
      { username: 'ana.lima', name: 'Ana Lima' },
      { username: 'bruno.reis', name: 'Bruno Reis' },
      { username: 'carla.melo', name: 'Carla Melo' },
    ].map((a) =>
      upsertUser({
        email: `${a.username}@ifma.edu.br`,
        username: a.username,
        name: a.name,
        roleId: roles.ALUNO.id,
        passwordHash,
      }),
    ),
  );

  const admCeuma = await upsertUser({
    email: 'gestor@ceuma.br',
    username: 'gestor.ceuma',
    name: 'Gestor CEUMA',
    roleId: roles.ADM_INSTITUICAO.id,
    passwordHash,
  });

  const alunoCeuma = await upsertUser({
    email: 'diego.castro@ceuma.br',
    username: 'diego.castro',
    name: 'Diego Castro',
    roleId: roles.ALUNO.id,
    passwordHash,
  });

  const memberships: Array<{
    userId: string;
    roleId: string;
    institutionId: string;
  }> = [
    {
      userId: admInst.id,
      roleId: roles.ADM_INSTITUICAO.id,
      institutionId: institution.id,
    },
    {
      userId: professor.id,
      roleId: roles.PROFESSOR.id,
      institutionId: institution.id,
    },
    {
      userId: professora.id,
      roleId: roles.PROFESSOR.id,
      institutionId: institution.id,
    },
    { userId: aluno.id, roleId: roles.ALUNO.id, institutionId: institution.id },
    ...alunosExtras.map((a) => ({
      userId: a.id,
      roleId: roles.ALUNO.id,
      institutionId: institution.id,
    })),
    {
      userId: admCeuma.id,
      roleId: roles.ADM_INSTITUICAO.id,
      institutionId: ceuma.id,
    },
    {
      userId: alunoCeuma.id,
      roleId: roles.ALUNO.id,
      institutionId: ceuma.id,
    },
  ];

  for (const m of memberships) {
    await prisma.institutionMember.upsert({
      where: {
        userId_institutionId: {
          userId: m.userId,
          institutionId: m.institutionId,
        },
      },
      create: {
        userId: m.userId,
        institutionId: m.institutionId,
        roleId: m.roleId,
      },
      update: {
        roleId: m.roleId,
        deletedAt: null,
      },
    });
  }

  const catProgramacao = await upsertCategory('Programação');
  const catMatematica = await upsertCategory('Matemática');
  const catGramatica = await upsertCategory('Gramática');

  const courseProgIni = await upsertCourse({
    title: 'Programação — Iniciante',
    synopsis:
      'Fundamentos de lógica e linguagem: variáveis, condicionais, laços e o essencial para escrever os primeiros programas com confiança.',
    categoryIds: [catProgramacao.id],
    teacherId: professor.id,
    status: CourseStatus.PUBLISHED,
  });

  const courseProgAv = await upsertCourse({
    title: 'Programação — Avançado',
    synopsis:
      'Estruturas de dados, padrões de projeto e práticas para evoluir do código funcional para soluções mais robustas e organizadas.',
    categoryIds: [catProgramacao.id],
    teacherId: professor.id,
    status: CourseStatus.PUBLISHED,
  });

  const courseMat = await upsertCourse({
    title: 'Matemática — Básico',
    synopsis:
      'Álgebra e aritmética essenciais: números, operações, expressões e o raciocínio necessário para resolver problemas do dia a dia e avançar nos estudos.',
    categoryIds: [catMatematica.id],
    teacherId: professor.id,
    status: CourseStatus.PUBLISHED,
  });

  const courseGram = await upsertCourse({
    title: 'Gramática',
    synopsis:
      'Morfologia e sintaxe aplicadas à leitura e à escrita, com exemplos práticos para reconhecer e usar as estruturas da língua com mais precisão.',
    categoryIds: [catGramatica.id],
    teacherId: professora.id,
    status: CourseStatus.DRAFT,
  });

  // Invariante dos e2e: Gramática fica fora do IFMA (sem vínculo/matrícula).
  // Resíduos de testes/UI manuais não devem quebrar asserts de "sem matrícula → 403".
  const now = new Date();
  await prisma.institutionCourse.updateMany({
    where: { courseId: courseGram.id, deletedAt: null },
    data: { active: false, deletedAt: now },
  });
  await prisma.enrollment.updateMany({
    where: { courseId: courseGram.id, deletedAt: null },
    data: { status: EnrollmentStatus.INACTIVE, deletedAt: now },
  });
  await prisma.courseTeacher.updateMany({
    where: {
      courseId: courseGram.id,
      userId: { not: professora.id },
      deletedAt: null,
    },
    data: { deletedAt: now },
  });

  // Cursos vinculados ao IFMA + matrícula automática dos alunos da instituição
  await linkCourseAndEnrollStudents(
    institution.id,
    courseProgIni.id,
    roles.ALUNO.id,
  );
  await linkCourseAndEnrollStudents(
    institution.id,
    courseMat.id,
    roles.ALUNO.id,
  );
  await linkCourseAndEnrollStudents(ceuma.id, courseProgIni.id, roles.ALUNO.id);

  // Conteúdo visualizável nos dois cursos alocados
  await seedCoursePedagogy(courseProgIni.id, professor.id, 'prog');
  await seedCoursePedagogy(courseMat.id, professor.id, 'mat');

  return {
    institution,
    ceuma,
    users: {
      master,
      admInst,
      professor,
      professora,
      aluno,
      alunosExtras,
      admCeuma,
      alunoCeuma,
    },
    roles,
    categories: {
      programacao: catProgramacao,
      matematica: catMatematica,
      gramatica: catGramatica,
    },
    courses: {
      progIni: courseProgIni,
      progAv: courseProgAv,
      mat: courseMat,
      gram: courseGram,
    },
    password: SEED_PASSWORD,
  };
}

async function main() {
  const result = await runSeed();
  console.log('Seed OK');
  console.log(`  Instituição: ${result.institution.slug}`);
  console.log(`  Senha padrão: ${result.password}`);
  console.log('  Logins (username):');
  console.log('    admin          → ADM_MASTER');
  console.log('    instituicao    → ADM_INSTITUICAO (IFMA)');
  console.log('    gestor.ceuma   → ADM_INSTITUICAO (CEUMA)');
  console.log('    professor      → PROFESSOR (IFMA)');
  console.log('    marina.souza   → PROFESSOR (IFMA)');
  console.log('    aluno          → ALUNO (IFMA)');
  console.log('    ana.lima / bruno.reis / carla.melo → ALUNO (IFMA)');
  console.log('    diego.castro   → ALUNO (CEUMA)');
  console.log(
    `  Cursos alocados (IFMA): ${result.courses.progIni.title}, ${result.courses.mat.title}`,
  );
  console.log(
    '  (com conteúdos, módulo, atividade, quiz e tópico de comunidade)',
  );
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
