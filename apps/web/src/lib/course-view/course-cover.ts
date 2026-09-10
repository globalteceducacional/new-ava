import { getApiBaseUrl } from '@/lib/auth/session';

/** URL da capa: pública só para publicado; `authenticated` usa cookie JWT (rascunho no editor). */
export function courseCoverUrl(
  courseId: string,
  cacheKey?: string | number,
  authenticated = false,
): string {
  const q = cacheKey ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
  if (authenticated) {
    return `${getApiBaseUrl()}/courses/${courseId}/cover${q}`;
  }
  return `${getApiBaseUrl()}/course-covers/${courseId}${q}`;
}
