import { apiFetch } from '@/lib/auth/api';
import type { CommunityCourseOption } from '@/components/community/CommunityFeed';

/** Comunidades do usuário (aluno, professor, instituição ou master). */
export async function loadCatalogCoursesForCommunity(): Promise<CommunityCourseOption[]> {
  return apiFetch<CommunityCourseOption[]>('/courses/communities');
}
