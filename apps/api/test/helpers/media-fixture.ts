import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as { path: string };

/** Gera um MP4 curto de fixture via ffmpeg bundled. */
export function ensureTinyMp4Fixture(): string {
  const dir = join(__dirname, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'tiny.mp4');
  const result = spawnSync(
    ffmpegInstaller.path,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:d=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(
      `Falha ao gerar fixture MP4: ${result.stderr || result.error}`,
    );
  }
  return out;
}

/** Buffer que parece texto — falha na validação de magic bytes. */
export function fakeTextAsVideo(): Buffer {
  return Buffer.from('isto-nao-e-um-video');
}

/** MP4 mínimo inválido para forçar FAILED no worker (ftyp ok, stream quebrado). */
export function corruptMp4WithFtyp(): Buffer {
  // Cabeçalho ftyp mínimo + lixo
  const buf = Buffer.alloc(64, 0);
  buf.writeUInt32BE(20, 0);
  buf.write('ftyp', 4);
  buf.write('isom', 8);
  buf.write('not-a-real-mp4-payload', 20);
  return buf;
}

export function writeTempFile(name: string, data: Buffer): string {
  const dir = join(__dirname, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, data);
  return p;
}
