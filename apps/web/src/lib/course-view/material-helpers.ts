import type { VideoMaterialRow } from '@/lib/course-editor/types';

/** Tipos oferecidos na UI de criação (arquivo vira PDF ou FILE conforme a URL). */
export type MaterialFormKind = 'LINK' | 'FILE' | 'QUIZ';

export const MATERIAL_FORM_KINDS: {
  value: MaterialFormKind;
  label: string;
  hint: string;
}[] = [
  {
    value: 'LINK',
    label: 'Link',
    hint: 'O aluno vê a URL clicável diretamente.',
  },
  {
    value: 'FILE',
    label: 'Arquivo (PDF ou documento)',
    hint: 'Cole o link direto do arquivo. O aluno poderá abrir no navegador ou baixar.',
  },
  {
    value: 'QUIZ',
    label: 'Quiz vinculado',
    hint: 'Avaliação ligada a esta aula (informe o ID do questionário).',
  },
];

export function materialFormKindFromType(type: VideoMaterialRow['type']): MaterialFormKind {
  if (type === 'LINK') return 'LINK';
  if (type === 'QUIZ') return 'QUIZ';
  return 'FILE';
}

/** Define o tipo persistido a partir do formulário e da URL. */
export function resolveMaterialType(kind: MaterialFormKind, url: string): VideoMaterialRow['type'] {
  if (kind === 'LINK') return 'LINK';
  if (kind === 'QUIZ') return 'QUIZ';
  return /\.pdf(\?|#|$)/i.test(url.trim()) ? 'PDF' : 'FILE';
}

export function suggestTitleFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'Link';
  } catch {
    return 'Link';
  }
}

export function filenameFromUrl(url: string, fallback = 'material'): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split('/').filter(Boolean).pop();
    if (name && name.includes('.')) return decodeURIComponent(name);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function isDownloadableMaterial(type: VideoMaterialRow['type']): boolean {
  return type === 'PDF' || type === 'FILE';
}
