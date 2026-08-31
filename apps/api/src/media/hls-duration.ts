import type { MinioService } from './minio.service';

const cache = new Map<string, number>();

/** Soma os #EXTINF do manifesto HLS. */
export function parseHlsDurationSec(m3u8: string): number | null {
  let total = 0;
  let found = false;
  for (const line of m3u8.split(/\r?\n/)) {
    const match = line.match(/^#EXTINF:([\d.]+)/);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  return found && total > 0 ? total : null;
}

export function rememberHlsDuration(hlsPrefix: string, durationSec: number) {
  if (durationSec > 0) cache.set(hlsPrefix, durationSec);
}

/** Duração em segundos: cache → duration.txt → soma do index.m3u8. */
export async function resolveHlsDurationSec(
  minio: MinioService,
  hlsPrefix: string,
): Promise<number | null> {
  const cached = cache.get(hlsPrefix);
  if (cached != null) return cached;

  try {
    const raw = await minio.getObjectBuffer(`${hlsPrefix}duration.txt`);
    const fromFile = Number(raw.toString('utf8').trim());
    if (Number.isFinite(fromFile) && fromFile > 0) {
      cache.set(hlsPrefix, fromFile);
      return fromFile;
    }
  } catch {
    // arquivo ainda não existe nos HLS antigos
  }

  try {
    const playlist = await minio.getObjectBuffer(`${hlsPrefix}index.m3u8`);
    const fromM3u8 = parseHlsDurationSec(playlist.toString('utf8'));
    if (fromM3u8 != null) {
      cache.set(hlsPrefix, fromM3u8);
      return fromM3u8;
    }
  } catch {
    return null;
  }

  return null;
}
