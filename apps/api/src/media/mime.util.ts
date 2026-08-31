/** Whitelist de MIME de vídeo aceitos no upload. */
export const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
]);

/**
 * Valida magic bytes básicos do arquivo (não confia só no Content-Type).
 */
export function matchesVideoMagic(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;

  // WebM / Matroska: 1A 45 DF A3
  if (
    mimeType === 'video/webm' &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return true;
  }

  // AVI: RIFF....AVI
  if (
    mimeType === 'video/x-msvideo' &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 11) === 'AVI'
  ) {
    return true;
  }

  // MP4 / QuickTime: ....ftyp
  if (
    (mimeType === 'video/mp4' || mimeType === 'video/quicktime') &&
    buffer.toString('ascii', 4, 8) === 'ftyp'
  ) {
    return true;
  }

  return false;
}
