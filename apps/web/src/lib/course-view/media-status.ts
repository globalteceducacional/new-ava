const STATUS_LABELS: Record<string, string> = {
  UPLOADING: 'enviando',
  PROCESSING: 'processando',
  READY: 'pronto',
  FAILED: 'falhou',
};

/** Rótulo do status do vídeo (ex.: "processando 45%"). */
export function mediaStatusLabel(status: string, progressPercent?: number | null): string {
  const base = STATUS_LABELS[status] ?? status.toLowerCase();
  if ((status === 'PROCESSING' || status === 'UPLOADING') && typeof progressPercent === 'number') {
    const pct = Math.min(100, Math.max(0, Math.round(progressPercent)));
    return `${base} ${pct}%`;
  }
  return base;
}
