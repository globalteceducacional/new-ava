import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MediaAssetStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { FfmpegService } from './ffmpeg.service';
import { MinioService } from './minio.service';

/** JPEG em MinIO + posterKey — usado no fallback da capa do curso. */
@Injectable()
export class MediaPosterService implements OnModuleInit {
  private readonly logger = new Logger(MediaPosterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  onModuleInit() {
    void this.backfillMissing().catch((err) => {
      this.logger.warn(
        `Backfill de posters falhou: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  async storeFromFile(
    mediaAssetId: string,
    inputPath: string,
  ): Promise<string | null> {
    const posterBuf = await this.ffmpeg.extractPosterToBuffer(inputPath);
    const posterKey = `posters/${mediaAssetId}.jpg`;
    await this.minio.putObject(
      posterKey,
      posterBuf,
      'image/jpeg',
      posterBuf.length,
    );
    await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { posterKey },
    });
    return posterKey;
  }

  /**
   * Vídeos READY anteriores à extração de poster: gera JPEG do 1º segmento HLS
   * (arquivo pequeno) ou, se não houver, do original.
   */
  async backfillMissing(): Promise<void> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        status: MediaAssetStatus.READY,
        posterKey: null,
      },
      select: { id: true, storageKey: true, hlsPrefix: true },
      take: 80,
    });
    if (!assets.length) return;

    this.logger.log(`Backfill de posters: ${assets.length} mídia(s) sem capa`);
    for (const asset of assets) {
      try {
        const ok = await this.extractForReadyAsset(asset);
        if (ok) this.logger.log(`Poster gerado: ${asset.id}`);
        else this.logger.warn(`Poster indisponível: ${asset.id}`);
      } catch (err) {
        this.logger.warn(
          `Poster ${asset.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async extractForReadyAsset(asset: {
    id: string;
    storageKey: string;
    hlsPrefix: string | null;
  }): Promise<boolean> {
    const keys: string[] = [];
    if (asset.hlsPrefix) keys.push(`${asset.hlsPrefix}seg_000.ts`);
    keys.push(asset.storageKey);

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-poster-src-'));
    try {
      for (const key of keys) {
        try {
          const buf = await this.minio.getObjectBuffer(key);
          const ext = key.endsWith('.ts') ? '.ts' : path.extname(key) || '.bin';
          const inputPath = path.join(tmpRoot, `src${ext}`);
          await fs.writeFile(inputPath, buf);
          await this.storeFromFile(asset.id, inputPath);
          return true;
        } catch {
          /* tenta a próxima chave */
        }
      }
      return false;
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
