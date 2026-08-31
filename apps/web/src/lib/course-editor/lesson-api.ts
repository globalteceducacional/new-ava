import { apiFetch } from '@/lib/auth/api';
import type { VideoMaterialRow } from '@/lib/course-editor/types';

/**
 * Operações de módulo/aula/material compartilhadas entre o wizard de edição
 * e a visualização do curso (admin e professor).
 */

export type MaterialType = VideoMaterialRow['type'];

export const MATERIAL_TYPES: MaterialType[] = ['LINK', 'PDF', 'FILE', 'QUIZ'];

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  LINK: 'Link',
  PDF: 'PDF',
  FILE: 'Arquivo',
  QUIZ: 'Quiz',
};

export function updateModule(
  courseId: string,
  moduleId: string,
  data: { title?: string; description?: string | null },
) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteModule(courseId: string, moduleId: string) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}`, {
    method: 'DELETE',
  });
}

export function reorderModules(courseId: string, orderedIds: string[]) {
  return apiFetch(`/courses/${courseId}/modules/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  });
}

export function createLesson(
  courseId: string,
  moduleId: string,
  data: { title: string; description?: string },
) {
  return apiFetch<{ id: string }>(`/courses/${courseId}/modules/${moduleId}/videos`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateLesson(
  courseId: string,
  moduleId: string,
  videoId: string,
  data: { title?: string; description?: string | null },
) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}/videos/${videoId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteLesson(courseId: string, moduleId: string, videoId: string) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}/videos/${videoId}`, {
    method: 'DELETE',
  });
}

export function reorderLessons(courseId: string, moduleId: string, orderedIds: string[]) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}/videos/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  });
}

/** Envia o arquivo para transcodificação HLS e vincula à aula. */
export function uploadLessonVideo(videoId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/media/upload?moduleVideoId=${videoId}`, {
    method: 'POST',
    body: form,
  });
}

/** Desvincula o vídeo atual para permitir a substituição por outro arquivo. */
export function removeLessonVideo(mediaId: string) {
  return apiFetch(`/media/${mediaId}`, { method: 'DELETE' });
}

/** Reprocessa o original no storage (H.264+AAC) sem reenviar o arquivo. */
export function reprocessLessonVideo(mediaId: string) {
  return apiFetch(`/media/${mediaId}/reprocess`, { method: 'POST' });
}

/** Reprocessa todos os vídeos prontos/falhos do curso. */
export function reprocessCourseVideos(courseId: string) {
  return apiFetch<{ queued: number }>(`/media/reprocess-course/${courseId}`, {
    method: 'POST',
  });
}

export function createLessonMaterial(
  courseId: string,
  moduleId: string,
  videoId: string,
  data: { type: MaterialType; title: string; url?: string; refId?: string },
) {
  return apiFetch(`/courses/${courseId}/modules/${moduleId}/videos/${videoId}/materials`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateLessonMaterial(
  courseId: string,
  moduleId: string,
  videoId: string,
  materialId: string,
  data: { type?: MaterialType; title?: string; url?: string | null },
) {
  return apiFetch(
    `/courses/${courseId}/modules/${moduleId}/videos/${videoId}/materials/${materialId}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}

export function deleteLessonMaterial(
  courseId: string,
  moduleId: string,
  videoId: string,
  materialId: string,
) {
  return apiFetch(
    `/courses/${courseId}/modules/${moduleId}/videos/${videoId}/materials/${materialId}`,
    { method: 'DELETE' },
  );
}
