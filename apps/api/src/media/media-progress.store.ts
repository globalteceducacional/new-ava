/** Progresso 0–100 da transcodificação (processo local). */
const byAssetId = new Map<string, number>();

export function setMediaProgress(mediaAssetId: string, percent: number) {
  byAssetId.set(mediaAssetId, Math.max(0, Math.min(100, Math.round(percent))));
}

export function getMediaProgress(mediaAssetId: string): number | undefined {
  return byAssetId.get(mediaAssetId);
}

export function clearMediaProgress(mediaAssetId: string) {
  byAssetId.delete(mediaAssetId);
}

export function withMediaProgress<T extends { id: string }>(
  asset: T | null | undefined,
): (T & { progressPercent: number }) | null {
  if (!asset) return null;
  return {
    ...asset,
    progressPercent: getMediaProgress(asset.id) ?? 0,
  };
}
