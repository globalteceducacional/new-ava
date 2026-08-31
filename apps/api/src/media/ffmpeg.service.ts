import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as {
  path: string;
};

type ProbeResult = {
  videoCodec: string | null;
  pixFmt: string | null;
  audioCodec: string | null;
  durationSec: number | null;
};

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  readonly binaryPath = ffmpegInstaller.path;

  /**
   * Converte arquivo de vídeo em pasta HLS (index.m3u8 + segmentos .ts).
   * Copia o stream só se já for H.264 8-bit + AAC (compatível com Chrome/hls.js).
   * Caso contrário re-encoda — HEVC/H.265, VP9, 10-bit etc. tocam só o áudio no browser.
   */
  async transcodeToHls(
    inputPath: string,
    onProgress?: (ratio: number) => void,
  ): Promise<{ outDir: string; durationSec: number | null }> {
    const probe = await this.probe(inputPath);
    const canCopy = isBrowserSafeCopy(probe);
    this.logger.log(
      `Probe: video=${probe.videoCodec ?? '-'} pix=${probe.pixFmt ?? '-'} audio=${probe.audioCodec ?? '-'} dur=${probe.durationSec ?? '-'} → ${canCopy ? 'copy' : 'libx264+aac'}`,
    );

    if (canCopy) {
      try {
        const outDir = await this.runHls(inputPath, copyArgs(), onProgress);
        return { outDir, durationSec: probe.durationSec };
      } catch (firstErr) {
        this.logger.warn(
          `HLS copy falhou, re-encodando: ${firstErr instanceof Error ? firstErr.message : firstErr}`,
        );
      }
    }

    const outDir = await this.runHls(inputPath, encodeArgs(), onProgress);
    return { outDir, durationSec: probe.durationSec };
  }

  private async runHls(
    inputPath: string,
    codecArgs: string[],
    onProgress?: (ratio: number) => void,
  ): Promise<string> {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-hls-'));
    const playlist = path.join(outDir, 'index.m3u8');
    const segmentPattern = path.join(outDir, 'seg_%03d.ts');
    try {
      await this.run(
        [
          '-y',
          '-i',
          inputPath,
          ...codecArgs,
          '-start_number',
          '0',
          '-hls_time',
          '4',
          '-hls_list_size',
          '0',
          '-hls_flags',
          'independent_segments',
          '-f',
          'hls',
          '-hls_segment_filename',
          segmentPattern,
          playlist,
        ],
        onProgress,
      );
      return outDir;
    } catch (err) {
      await fs
        .rm(outDir, { recursive: true, force: true })
        .catch(() => undefined);
      throw err;
    }
  }

  /** Lê codecs do arquivo via stderr do ffmpeg (sem ffprobe). */
  private probe(inputPath: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, ['-hide_banner', '-i', inputPath], {
        windowsHide: true,
      });
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', () => {
        resolve(parseProbe(stderr));
      });
    });
  }

  private run(
    args: string[],
    onProgress?: (ratio: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, { windowsHide: true });
      let stderr = '';
      let durationSec: number | null = null;
      proc.stderr.on('data', (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        if (durationSec == null) {
          durationSec = parseFfmpegClock(
            stderr,
            /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/,
          );
        }
        if (onProgress && durationSec && durationSec > 0) {
          const t = parseFfmpegClock(chunk, /time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (t != null) onProgress(Math.min(1, t / durationSec));
        }
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-800)}`),
          );
      });
    });
  }
}

function copyArgs(): string[] {
  return ['-c', 'copy'];
}

/** H.264 8-bit + AAC — o que Chrome, Edge e hls.js conseguem decodificar. */
function encodeArgs(): string[] {
  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-ar',
    '48000',
  ];
}

function parseProbe(stderr: string): ProbeResult {
  const videoLine = stderr.match(/Stream #[^\r\n]*Video:\s*([a-zA-Z0-9_]+)/);
  const audioLine = stderr.match(/Stream #[^\r\n]*Audio:\s*([a-zA-Z0-9_]+)/);
  const pixLine = stderr.match(
    /Video:\s*[^\r\n]*?\b(yuv[\w]+|nv12|nv21|rgb[\w]*)\b/i,
  );
  return {
    videoCodec: videoLine?.[1]?.toLowerCase() ?? null,
    pixFmt: pixLine?.[1]?.toLowerCase() ?? null,
    audioCodec: audioLine?.[1]?.toLowerCase() ?? null,
    durationSec: parseFfmpegClock(
      stderr,
      /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/,
    ),
  };
}

function isBrowserSafeCopy(probe: ProbeResult): boolean {
  const videoOk =
    probe.videoCodec === 'h264' ||
    probe.videoCodec === 'avc1' ||
    probe.videoCodec === 'avc';
  const pixOk =
    !probe.pixFmt || probe.pixFmt === 'yuv420p' || probe.pixFmt === 'yuvj420p';
  const audioOk =
    !probe.audioCodec ||
    probe.audioCodec === 'aac' ||
    probe.audioCodec === 'mp3';
  return videoOk && pixOk && audioOk;
}

function parseFfmpegClock(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
