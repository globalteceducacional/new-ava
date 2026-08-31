import { getStoredUser } from '@/lib/auth/session';

const STORAGE_PREFIX = 'ava_recent_courses:';
const MAX_RECENT = 12;

function storageKey(): string {
  const userId = getStoredUser()?.id ?? 'anon';
  return `${STORAGE_PREFIX}${userId}`;
}

type RecentEntry = { courseId: string; at: number };

function readRecent(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is RecentEntry =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as RecentEntry).courseId === 'string' &&
        typeof (row as RecentEntry).at === 'number',
    );
  } catch {
    return [];
  }
}

function writeRecent(entries: RecentEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(), JSON.stringify(entries.slice(0, MAX_RECENT)));
}

/** Registra que o aluno abriu este curso (mais recente primeiro). */
export function touchRecentCourse(courseId: string) {
  if (!courseId || typeof window === 'undefined') return;
  const next = [
    { courseId, at: Date.now() },
    ...readRecent().filter((e) => e.courseId !== courseId),
  ];
  writeRecent(next);
}

/** IDs de cursos vistos recentemente (ordem: mais recente → mais antigo). */
export function getRecentCourseIds(): string[] {
  return readRecent().map((e) => e.courseId);
}
