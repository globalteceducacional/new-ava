/** Roles do AVA — alinhados ao roadmap (seção 4.1). */
export const Role = {
  ADM_MASTER: 'ADM_MASTER',
  ADM_INSTITUICAO: 'ADM_INSTITUICAO',
  PROFESSOR: 'PROFESSOR',
  ALUNO: 'ALUNO',
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];
