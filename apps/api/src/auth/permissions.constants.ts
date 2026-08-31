/** Códigos de permissão — matriz RBAC do roadmap (seção 4.2). */
export const PermissionCode = {
  INSTITUTION_CREATE: 'institution.create',
  SYSTEM_CONFIG: 'system.config',
  USER_MANAGE: 'user.manage',
  CATEGORY_CREATE: 'category.create',
  COURSE_CREATE: 'course.create',
  COURSE_INSTITUTION_LINK: 'course.institution.link',
  COURSE_CONTENT_EDIT: 'course.content.edit',
  ENROLLMENT_MANAGE: 'enrollment.manage',
  ACTIVITY_CREATE: 'activity.create',
  ACTIVITY_SUBMIT: 'activity.submit',
  GRADE_VIEW: 'grade.view',
  VIDEO_UPLOAD: 'video.upload',
  VIDEO_WATCH: 'video.watch',
  COMMUNITY_POST: 'community.post',
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionCodeValue =
  (typeof PermissionCode)[keyof typeof PermissionCode];

export const PERMISSION_DEFINITIONS: Array<{
  code: PermissionCodeValue;
  module: string;
  description: string;
}> = [
  {
    code: PermissionCode.INSTITUTION_CREATE,
    module: 'institution',
    description: 'Criar instituição',
  },
  {
    code: PermissionCode.SYSTEM_CONFIG,
    module: 'system',
    description: 'Configurações globais do sistema',
  },
  {
    code: PermissionCode.USER_MANAGE,
    module: 'user',
    description: 'Gerenciar usuários da instituição',
  },
  {
    code: PermissionCode.CATEGORY_CREATE,
    module: 'category',
    description: 'Criar categoria (catálogo)',
  },
  {
    code: PermissionCode.COURSE_CREATE,
    module: 'course',
    description: 'Criar curso (catálogo)',
  },
  {
    code: PermissionCode.COURSE_INSTITUTION_LINK,
    module: 'course',
    description: 'Vincular curso ↔ instituição',
  },
  {
    code: PermissionCode.COURSE_CONTENT_EDIT,
    module: 'course',
    description: 'Editar conteúdos do curso',
  },
  {
    code: PermissionCode.ENROLLMENT_MANAGE,
    module: 'enrollment',
    description: 'Matricular alunos',
  },
  {
    code: PermissionCode.ACTIVITY_CREATE,
    module: 'activity',
    description: 'Criar atividade / questionário',
  },
  {
    code: PermissionCode.ACTIVITY_SUBMIT,
    module: 'activity',
    description: 'Entregar atividade / responder quiz',
  },
  {
    code: PermissionCode.GRADE_VIEW,
    module: 'grade',
    description: 'Ver boletim do curso',
  },
  {
    code: PermissionCode.VIDEO_UPLOAD,
    module: 'media',
    description: 'Upload de vídeo',
  },
  {
    code: PermissionCode.VIDEO_WATCH,
    module: 'media',
    description: 'Assistir vídeo',
  },
  {
    code: PermissionCode.COMMUNITY_POST,
    module: 'community',
    description: 'Criar / responder tópico na Comunidade',
  },
  {
    code: PermissionCode.AUDIT_VIEW,
    module: 'audit',
    description: 'Ver logs de auditoria',
  },
];

/** Matriz roadmap 4.2: role → permissões concedidas (Master tem todas). */
export const ROLE_PERMISSION_MATRIX: Record<string, PermissionCodeValue[]> = {
  ADM_MASTER: Object.values(PermissionCode),
  ADM_INSTITUICAO: [
    PermissionCode.USER_MANAGE,
    PermissionCode.COURSE_INSTITUTION_LINK,
    PermissionCode.COURSE_CONTENT_EDIT,
    PermissionCode.ENROLLMENT_MANAGE,
    PermissionCode.ACTIVITY_CREATE,
    PermissionCode.GRADE_VIEW,
    PermissionCode.VIDEO_UPLOAD,
    PermissionCode.VIDEO_WATCH,
    PermissionCode.COMMUNITY_POST,
    PermissionCode.AUDIT_VIEW,
  ],
  PROFESSOR: [
    PermissionCode.COURSE_CREATE,
    PermissionCode.COURSE_CONTENT_EDIT,
    PermissionCode.ENROLLMENT_MANAGE,
    PermissionCode.ACTIVITY_CREATE,
    PermissionCode.GRADE_VIEW,
    PermissionCode.VIDEO_UPLOAD,
    PermissionCode.VIDEO_WATCH,
    PermissionCode.COMMUNITY_POST,
  ],
  ALUNO: [
    PermissionCode.ACTIVITY_SUBMIT,
    PermissionCode.GRADE_VIEW,
    PermissionCode.VIDEO_WATCH,
    PermissionCode.COMMUNITY_POST,
  ],
};
