import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MediaAssetStatus } from '@prisma/client';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { FfmpegService } from './ffmpeg.service';
import { rememberHlsDuration } from './hls-duration';
import { clearMediaProgress, setMediaProgress } from './media-progress.store';
import { MinioService } from './minio.service';

export const MEDIA_TRANSCODE_QUEUE = 'media-transcode';

export type MediaTranscodeJob = { mediaAssetId: string };

@Processor(MEDIA_TRANSCODE_QUEUE, {
  concurrency: Number(process.env.MEDIA_TRANSCODE_CONCURRENCY ?? '1'),
})
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly ffmpeg: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<MediaTranscodeJob>): Promise<void> {
    const { mediaAssetId } = job.data;
    this.logger.log(`Transcodificando media ${mediaAssetId}`);

    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, deletedAt: null },
    });
    if (!asset) {
      this.logger.warn(`MediaAsset ${mediaAssetId} não encontrado`);
      return;
    }

    await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { status: MediaAssetStatus.PROCESSING, errorMessage: null },
    });
    setMediaProgress(mediaAssetId, 1);

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-src-'));
    const ext = path.extname(asset.originalFilename) || '.mp4';
    const inputPath = path.join(tmpRoot, `source${ext}`);
    let hlsDir: string | null = null;
    let lastSaved = 1;
    let lastAt = 0;

    const saveProgress = (pct: number) => {
      const next = Math.max(0, Math.min(99, Math.round(pct)));
      const now = Date.now();
      if (next < lastSaved + 2 && now - lastAt < 800) return;
      lastSaved = next;
      lastAt = now;
      setMediaProgress(mediaAssetId, next);
    };

    try {
      const buf = await this.minio.getObjectBuffer(asset.storageKey);
      await fs.writeFile(inputPath, buf);
      saveProgress(10);

      const transcoded = await this.ffmpeg.transcodeToHls(
        inputPath,
        (ratio) => {
          saveProgress(10 + ratio * 75);
        },
      );
      hlsDir = transcoded.outDir;
      const hlsPrefix = `hls/${mediaAssetId}/`;
      if (transcoded.durationSec && transcoded.durationSec > 0) {
        await this.minio.putObject(
          `${hlsPrefix}duration.txt`,
          Buffer.from(String(transcoded.durationSec), 'utf8'),
          'text/plain',
        );
        rememberHlsDuration(hlsPrefix, transcoded.durationSec);
      }
      const files = await fs.readdir(hlsDir);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const full = path.join(hlsDir, file);
        const data = await fs.readFile(full);
        const contentType = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : file.endsWith('.ts')
            ? 'video/mp2t'
            : 'application/octet-stream';
        await this.minio.putObject(`${hlsPrefix}${file}`, data, contentType);
        saveProgress(85 + ((i + 1) / files.length) * 14);
      }

      setMediaProgress(mediaAssetId, 100);
      await this.prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          status: MediaAssetStatus.READY,
          hlsPrefix,
          errorMessage: null,
        },
      });
      clearMediaProgress(mediaAssetId);
      this.logger.log(`Media ${mediaAssetId} READY`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha na transcodificação';
      this.logger.error(`Media ${mediaAssetId} FAILED: ${message}`);
      clearMediaProgress(mediaAssetId);
      await this.prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          status: MediaAssetStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });
      throw err;
    } finally {
      await fs
        .rm(tmpRoot, { recursive: true, force: true })
        .catch(() => undefined);
      if (hlsDir) {
        await fs
          .rm(hlsDir, { recursive: true, force: true })
          .catch(() => undefined);
      }
    }
  }
}
