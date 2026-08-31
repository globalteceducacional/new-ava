/** Contratos das rotas administrativas da API (apps/api/src/{admin,users,institutions}). */

export type RoleCode = 'ADM_MASTER' | 'ADM_INSTITUICAO' | 'PROFESSOR' | 'ALUNO';
export type UserStatus = 'ACTIVE' | 'BLOCKED';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADM_MASTER: 'Administrador master',
  ADM_INSTITUICAO: 'Admin da instituição',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

export type InstitutionRef = { id: string; name: string; slug: string };

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  status: UserStatus;
  role: RoleCode;
  roleName: string;
  institutions: InstitutionRef[];
  enrollmentCount: number;
  teachingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type Institution = {
  id: string;
  name: string;
  slug: string;
  status: string;
  memberCount: number;
  courseCount: number;
  enrollmentCount: number;
  createdAt: string;
  /** Gestores (ADM_INSTITUICAO) vinculados à instituição. */
  admins?: Array<{
    id: string;
    name: string;
    username: string;
    email: string;
  }>;
};

export type InstitutionDetail = Institution & {
  membersByRole: Array<{ role: string; count: number }>;
};

export type AdminOverview = {
  institutions: number;
  students: number;
  teachers: number;
  institutionAdmins: number;
  courses: {
    total: number;
    published: number;
    draft: number;
    withoutTeacher: number;
  };
  enrollments: number;
  pendingSubmissions: number;
  recentLogins: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  metadata: unknown;
  actor: { id: string; name: string; username: string } | null;
  institution: { id: string; name: string } | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

export type Course = {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  /** Carga horária em horas inteiras. */
  workloadHours?: number;
  status: CourseStatus;
  categories: Array<{ category: { id: string; name: string } }>;
  teachers: Array<{
    user: { id: string; name: string; email: string };
  }>;
};

export type CourseTeacher = {
  id: string;
  user: { id: string; name: string; email: string };
};

export type CourseEnrollment = {
  id: string;
  status: string;
  enrolledAt: string;
  user: { id: string; name: string; email: string; username: string };
  institution: { id: string; name: string };
};

export type CourseInstitutionLink = {
  id: string;
  active: boolean;
  linkedAt: string;
  institution: InstitutionRef;
};

export type UserOption = {
  id: string;
  name: string;
  email: string;
  username: string;
};
