import { apiFetch } from '@/lib/auth/api';
import { getStoredUser } from '@/lib/auth/session';

/**
 * Progresso de aulas: servidor é a fonte da verdade.
 * localStorage permanece como cache otimista / offline e migração.
 */

const STORAGE_PREFIX = 'ava_module_progress:';
const IMPORTED_PREFIX = 'ava_progress_imported:';

/** Fração do vídeo que precisa ser alcançada para contar como assistido. */
export const WATCHED_RATIO = 0.9;

export type CourseLessonProgress = {
  courseId: string;
  watchedVideoIds: string[];
  byModule: Record<string, string[]>;
  totalLessons: number;
  watchedLessons: number;
  percent: number;
  courseCompletedAt: string | null;
};

/** True se o ponto atual do vídeo já passou de 90% da duração. */
export function isWatchProgressComplete(currentTime: number, duration: number): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  return currentTime / duration >= WATCHED_RATIO;
}

function storageKey(moduleId: string): string {
  const userId = getStoredUser()?.id ?? 'anon';
  return `${STORAGE_PREFIX}${userId}:${moduleId}`;
}

function importedKey(courseId: string): string {
  const userId = getStoredUser()?.id ?? 'anon';
  return `${IMPORTED_PREFIX}${userId}:${courseId}`;
}

function readCompleted(moduleId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(moduleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeCompleted(moduleId: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(moduleId), JSON.stringify(ids));
}

/** Marca a aula como assistida no cache local. */
export function markLessonWatched(moduleId: string, videoId: string): boolean {
  const ids = readCompleted(moduleId);
  if (ids.includes(videoId)) return false;
  writeCompleted(moduleId, [...ids, videoId]);
  return true;
}

/**
 * Reporta progresso ao servidor (e atualiza cache local se completar).
 */
export async function reportLessonProgress(params: {
  moduleVideoId: string;
  moduleId: string;
  currentTime: number;
  duration: number;
}): Promise<{ completed: boolean; courseCompleted: boolean } | null> {
  try {
    const res = await apiFetch<{
      completed: boolean;
      courseCompleted: boolean;
    }>(`/module-videos/${params.moduleVideoId}/progress`, {
      method: 'POST',
      body: JSON.stringify({
        currentTime: params.currentTime,
        duration: params.duration,
      }),
    });
    if (res.completed) {
      markLessonWatched(params.moduleId, params.moduleVideoId);
    }
    return res;
  } catch {
    // Fallback: só cache local se a API falhar.
    if (isWatchProgressComplete(params.currentTime, params.duration)) {
      markLessonWatched(params.moduleId, params.moduleVideoId);
      return { completed: true, courseCompleted: false };
    }
    return null;
  }
}

export async function fetchCourseLessonProgress(
  courseId: string,
): Promise<CourseLessonProgress | null> {
  try {
    return await apiFetch<CourseLessonProgress>(`/courses/${courseId}/lesson-progress`);
  } catch {
    return null;
  }
}

/**
 * Uma vez por curso/usuário: envia IDs do localStorage para o servidor.
 */
export async function migrateLocalProgressToServer(params: {
  courseId: string;
  moduleIds: string[];
}): Promise<CourseLessonProgress | null> {
  if (typeof window === 'undefined') return null;
  const key = importedKey(params.courseId);
  if (localStorage.getItem(key) === '1') {
    return fetchCourseLessonProgress(params.courseId);
  }

  const videoIds = params.moduleIds.flatMap((moduleId) => readCompleted(moduleId));
  try {
    if (videoIds.length) {
      const data = await apiFetch<CourseLessonProgress>(
        `/courses/${params.courseId}/lesson-progress/import`,
        {
          method: 'POST',
          body: JSON.stringify({ videoIds }),
        },
      );
      localStorage.setItem(key, '1');
      syncLocalCacheFromServer(data);
      return data;
    }
    localStorage.setItem(key, '1');
    return fetchCourseLessonProgress(params.courseId);
  } catch {
    return fetchCourseLessonProgress(params.courseId);
  }
}

/** Espelha resposta do servidor no localStorage (playlist rápida). */
export function syncLocalCacheFromServer(data: CourseLessonProgress) {
  for (const [moduleId, ids] of Object.entries(data.byModule ?? {})) {
    writeCompleted(moduleId, ids);
  }
}

export function getContinueLessonId(moduleId: string, orderedVideoIds: string[]): string | null {
  if (!orderedVideoIds.length) return null;
  const done = new Set(readCompleted(moduleId));
  const next = orderedVideoIds.find((id) => !done.has(id));
  return next ?? orderedVideoIds[orderedVideoIds.length - 1] ?? null;
}

export function hasModuleProgress(moduleId: string): boolean {
  return readCompleted(moduleId).length > 0;
}

export function hasCourseProgress(moduleIds: string[]): boolean {
  return moduleIds.some((id) => hasModuleProgress(id));
}

export function getWatchedLessonIds(moduleId: string): string[] {
  return readCompleted(moduleId);
}

export function getModuleCompletionPercent(moduleId: string, orderedVideoIds: string[]): number {
  if (!orderedVideoIds.length) return 0;
  const done = new Set(readCompleted(moduleId));
  const watched = orderedVideoIds.filter((id) => done.has(id)).length;
  return Math.round((watched / orderedVideoIds.length) * 100);
}
