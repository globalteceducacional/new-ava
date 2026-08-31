import type {
  Category,
  Course,
  CourseEnrollment,
  CourseInstitutionLink,
  CourseTeacher,
  Institution,
  UserOption,
} from '@/lib/admin/types';

export type ContentItemRow = {
  id: string;
  type: 'TEXT' | 'FILE' | 'LINK';
  title: string;
  body: string | null;
  url: string | null;
  sortOrder: number;
};

export type VideoMaterialRow = {
  id: string;
  type: 'PDF' | 'QUIZ' | 'LINK' | 'FILE';
  title: string;
  url: string | null;
  refId: string | null;
};

export type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  materials: VideoMaterialRow[];
  mediaAsset?: {
    id: string;
    status: string;
    progressPercent?: number;
    originalFilename: string;
    errorMessage: string | null;
  } | null;
};

export type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  videos: VideoRow[];
};

export type ActivityRow = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  allowLate: boolean;
  moduleId?: string | null;
  rubric: Array<{ key: string; label: string; weight: number }> | null;
};

export type QuizQuestionOption = {
  id?: string;
  text: string;
  isCorrect: boolean;
};

export type QuizQuestionDraft = {
  id?: string;
  type: 'MCQ' | 'TF' | 'MATCH' | 'NUMERIC' | 'ESSAY';
  text: string;
  points: number;
  options: QuizQuestionOption[];
};

export type QuizRow = {
  id: string;
  title: string;
  description: string | null;
  maxAttempts: number | null;
  timeLimitSec: number | null;
  graded: boolean;
  moduleId?: string | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  _count?: { questions: number };
  questions?: QuizQuestionDraft[];
};

export type CourseEditorMode = 'create' | 'edit';

export type CourseEditorCapabilities = {
  /** Oferta: professores, instituições, alunos, publicar. */
  canManageOffer: boolean;
  canPublish: boolean;
};

export type CourseEditorData = {
  course: Course | null;
  categories: Category[];
  contents: ContentItemRow[];
  modules: ModuleRow[];
  activities: ActivityRow[];
  quizzes: QuizRow[];
  teachers: CourseTeacher[];
  enrollments: CourseEnrollment[];
  institutionLinks: CourseInstitutionLink[];
  institutions: Institution[];
  teacherOptions: UserOption[];
  studentOptions: UserOption[];
};

export type WizardStepId = 'basics' | 'lessons' | 'assessments' | 'offer';

export const WIZARD_STEPS: Array<{
  id: WizardStepId;
  label: string;
  adminOnly?: boolean;
}> = [
  { id: 'basics', label: 'Dados' },
  { id: 'lessons', label: 'Aulas' },
  { id: 'assessments', label: 'Atividades' },
  { id: 'offer', label: 'Oferta', adminOnly: true },
];
