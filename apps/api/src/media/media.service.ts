import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { MediaAssetStatus, RoleCode } from '@prisma/client';
import { Queue } from 'bullmq';
import { createReadStream, promises as fs } from 'fs';
import type { AuthUser } from '../auth/auth.types';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { setMediaProgress } from './media-progress.store';
import {
  MEDIA_TRANSCODE_QUEUE,
  type MediaTranscodeJob,
} from './media.processor';
import { ALLOWED_VIDEO_MIMES, matchesVideoMagic } from './mime.util';
import { MinioService } from './minio.service';

export type MediaPlaybackTokenPayload = {
  sub: string;
  mediaId: string;
  typ: 'media';
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly access: CourseAccessService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectQueue(MEDIA_TRANSCODE_QUEUE)
    private readonly queue: Queue<MediaTranscodeJob>,
  ) {}

  maxUploadBytes(): number {
    return Number(
      this.config.get<string>('MEDIA_MAX_UPLOAD_BYTES') ?? '1073741824',
    );
  }

  async upload(
    file: Express.Multer.File | undefined,
    moduleVideoId: string | undefined,
    user: AuthUser,
  ) {
    if (!file)
      throw new BadRequestException('Arquivo obrigatório (campo "file")');
    if (!moduleVideoId) {
      throw new BadRequestException('moduleVideoId é obrigatório');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_VIDEO_MIMES.has(mime)) {
      throw new BadRequestException(
        `MIME não permitido: ${mime || 'desconhecido'}`,
      );
    }

    const maxBytes = this.maxUploadBytes();
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `Arquivo excede o tamanho máximo de ${maxBytes} bytes`,
      );
    }

    const tmpPath = file.path;
    let head: Buffer | undefined;
    if (tmpPath) {
      const fh = await fs.open(tmpPath, 'r');
      try {
        const buf = Buffer.alloc(64);
        const { bytesRead } = await fh.read(buf, 0, 64, 0);
        head = buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    } else if (file.buffer) {
      head = file.buffer.subarray(0, 64);
    }
    if (!head || !matchesVideoMagic(Buffer.from(head), mime)) {
      if (tmpPath) await fs.unlink(tmpPath).catch(() => undefined);
      throw new BadRequestException(
        'Conteúdo do arquivo não corresponde a um vídeo válido',
      );
    }

    const video = await this.prisma.moduleVideo.findFirst({
      where: { id: moduleVideoId, deletedAt: null },
      include: {
        mediaAsset: true,
        module: { select: { courseId: true } },
      },
    });
    if (!video) {
      if (tmpPath) await fs.unlink(tmpPath).catch(() => undefined);
      throw new NotFoundException('Vídeo do módulo não encontrado');
    }
    if (video.mediaAsset && !video.mediaAsset.deletedAt) {
      if (tmpPath) await fs.unlink(tmpPath).catch(() => undefined);
      throw new BadRequestException('Este vídeo já possui mídia vinculada');
    }
    // Vínculo remanescente de mídia já excluída: libera a chave única.
    if (video.mediaAsset?.deletedAt) {
      await this.prisma.mediaAsset.update({
        where: { id: video.mediaAsset.id },
        data: { moduleVideoId: null },
      });
    }

    await this.access.assertCanManage(video.module.courseId, user);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        ownerId: user.id,
        moduleVideoId,
        originalFilename: file.originalname || 'video.mp4',
        mimeType: mime,
        sizeBytes: BigInt(file.size),
        status: MediaAssetStatus.UPLOADING,
        storageKey: 'pending',
        createdBy: user.id,
      },
    });

    const storageKey = `originals/${asset.id}/source${extFromName(file.originalname, mime)}`;
    try {
      const body = tmpPath ? createReadStream(tmpPath) : file.buffer;
      await this.minio.putObject(
        storageKey,
        body,
        mime,
        tmpPath ? file.size : undefined,
      );
    } catch (err) {
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: MediaAssetStatus.FAILED,
          errorMessage:
            err instanceof Error ? err.message : 'Falha ao gravar no storage',
          storageKey,
        },
      });
      throw new BadRequestException('Falha ao armazenar o arquivo');
    } finally {
      if (tmpPath) await fs.unlink(tmpPath).catch(() => undefined);
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        storageKey,
        status: MediaAssetStatus.PROCESSING,
      },
    });
    setMediaProgress(asset.id, 1);

    await this.enqueueTranscode(asset.id);

    return this.serialize(updated);
  }

  /**
   * Reprocessa o original no MinIO (H.264+AAC). Não precisa reenviar o arquivo.
   * Usado quando o HLS antigo foi só copiado (HEVC) e o browser toca só o áudio.
   */
  async reprocess(id: string, user: AuthUser) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
      include: {
        moduleVideo: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!asset) throw new NotFoundException('Mídia não encontrada');
    if (!asset.storageKey || asset.storageKey === 'pending') {
      throw new BadRequestException(
        'Arquivo original indisponível para reprocessar',
      );
    }

    if (asset.moduleVideo) {
      await this.access.assertCanManage(
        asset.moduleVideo.module.courseId,
        user,
      );
    } else if (user.role !== RoleCode.ADM_MASTER && asset.ownerId !== user.id) {
      throw new NotFoundException('Mídia não encontrada');
    }

    if (
      asset.status === MediaAssetStatus.PROCESSING ||
      asset.status === MediaAssetStatus.UPLOADING
    ) {
      return this.serialize(asset);
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaAssetStatus.PROCESSING, errorMessage: null },
    });
    setMediaProgress(asset.id, 1);
    await this.enqueueTranscode(asset.id);
    return this.serialize(updated);
  }

  /** Enfileira de novo todos os vídeos prontos/falhos do curso (mesmo original). */
  async reprocessCourse(courseId: string, user: AuthUser) {
    await this.access.assertCanManage(courseId, user);

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        storageKey: { not: 'pending' },
        status: {
          in: [MediaAssetStatus.READY, MediaAssetStatus.FAILED],
        },
        moduleVideo: {
          deletedAt: null,
          module: { courseId, deletedAt: null },
        },
      },
      select: { id: true },
    });

    for (const asset of assets) {
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: MediaAssetStatus.PROCESSING, errorMessage: null },
      });
      setMediaProgress(asset.id, 1);
      await this.enqueueTranscode(asset.id);
    }

    return { queued: assets.length };
  }

  private enqueueTranscode(mediaAssetId: string) {
    return this.queue.add(
      'transcode',
      { mediaAssetId },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );
  }

  async getById(id: string, user: AuthUser) {
    const asset = await this.requireAsset(id);
    await this.assertCanAccessAsset(asset.id, user);
    return this.serialize(asset);
  }

  /**
   * Desvincula a mídia da aula (soft-delete) para permitir novo upload.
   * `moduleVideoId` volta a NULL porque é único: sem isso o próximo upload
   * colidiria com o registro antigo. O objeto no storage é preservado.
   */
  async remove(id: string, user: AuthUser) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
      include: {
        moduleVideo: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!asset) throw new NotFoundException('Mídia não encontrada');

    if (asset.moduleVideo) {
      await this.access.assertCanManage(
        asset.moduleVideo.module.courseId,
        user,
      );
    } else if (asset.ownerId !== user.id && user.role !== RoleCode.ADM_MASTER) {
      throw new NotFoundException('Mídia não encontrada');
    }

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { ...softDeleteData(user.id), moduleVideoId: null },
    });
    return { ok: true };
  }

  async playback(id: string, user: AuthUser) {
    const asset = await this.requireAsset(id);
    await this.assertCanAccessAsset(asset.id, user);

    if (
      asset.status === MediaAssetStatus.PROCESSING ||
      asset.status === MediaAssetStatus.UPLOADING
    ) {
      throw new BadRequestException('Vídeo ainda está sendo processado');
    }
    if (asset.status === MediaAssetStatus.FAILED) {
      throw new BadRequestException(
        asset.errorMessage ?? 'Processamento do vídeo falhou',
      );
    }
    if (asset.status !== MediaAssetStatus.READY || !asset.hlsPrefix) {
      throw new BadRequestException('Vídeo não está pronto para reprodução');
    }

    const expiresIn =
      this.config.get<string>('MEDIA_PLAYBACK_TOKEN_TTL') ?? '5m';
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        mediaId: asset.id,
        typ: 'media',
      } satisfies MediaPlaybackTokenPayload,
      { expiresIn: expiresIn as `${number}m` },
    );

    return {
      mediaId: asset.id,
      status: asset.status,
      playlistUrl: `/media/${asset.id}/hls/index.m3u8?token=${encodeURIComponent(token)}`,
      token,
      expiresIn,
    };
  }

  async streamHls(
    mediaId: string,
    relativePath: string,
    token: string | undefined,
  ): Promise<
    | {
        kind: 'body';
        body: Buffer | NodeJS.ReadableStream;
        contentType: string;
      }
    | { kind: 'redirect'; url: string }
  > {
    if (!token)
      throw new BadRequestException('Token de reprodução obrigatório');

    let payload: MediaPlaybackTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<MediaPlaybackTokenPayload>(token);
    } catch {
      throw new BadRequestException('Token de reprodução inválido ou expirado');
    }

    if (payload.typ !== 'media' || payload.mediaId !== mediaId) {
      throw new BadRequestException('Token não autorizado para esta mídia');
    }

    const asset = await this.requireAsset(mediaId);
    if (asset.status !== MediaAssetStatus.READY || !asset.hlsPrefix) {
      throw new NotFoundException('Stream indisponível');
    }

    const safe = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) {
      throw new BadRequestException('Caminho inválido');
    }

    const key = `${asset.hlsPrefix}${safe}`;
    const offload = this.minio.hlsOffloadEnabled;
    const signTtlSec = this.playbackTtlSeconds();

    // Segmentos (.ts): fora do Node (presign ou CDN+token).
    if (offload && !safe.endsWith('.m3u8')) {
      if (this.minio.useCdnTokenOffload) {
        const url = this.minio.cdnObjectUrl(key, token);
        if (url) return { kind: 'redirect', url };
      } else {
        const url = await this.minio.signedPublicGetUrl(key, signTtlSec);
        if (url) return { kind: 'redirect', url };
      }
    }

    if (safe.endsWith('.m3u8')) {
      const buf = await this.minio.getObjectBuffer(key);
      const lines = buf.toString('utf8').split('\n');
      const rewritten: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          rewritten.push(line);
          continue;
        }

        // Playlist aninhada: continua autenticada no Nest.
        if (trimmed.endsWith('.m3u8')) {
          const sep = trimmed.includes('?') ? '&' : '?';
          rewritten.push(`${trimmed}${sep}token=${encodeURIComponent(token)}`);
          continue;
        }

        const segKey = `${asset.hlsPrefix}${trimmed.replace(/^\/+/, '')}`;
        if (offload && this.minio.useCdnTokenOffload) {
          rewritten.push(this.minio.cdnObjectUrl(segKey, token) ?? trimmed);
        } else if (offload) {
          const signed = await this.minio.signedPublicGetUrl(
            segKey,
            signTtlSec,
          );
          rewritten.push(signed ?? trimmed);
        } else {
          const sep = trimmed.includes('?') ? '&' : '?';
          rewritten.push(`${trimmed}${sep}token=${encodeURIComponent(token)}`);
        }
      }

      return {
        kind: 'body',
        body: Buffer.from(rewritten.join('\n'), 'utf8'),
        contentType: 'application/vnd.apple.mpegurl',
      };
    }

    const obj = await this.minio.getObjectStream(key);
    return {
      kind: 'body',
      body: obj.body,
      contentType:
        obj.contentType ??
        (safe.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'),
    };
  }

  /**
   * Autoriza GET no Caddy (forward_auth) para /media-cdn/{bucket}/{key}?token=...
   * Só permite objetos sob o hlsPrefix da mídia do token.
   */
  async authorizeCdnRequest(
    forwardedUri: string | undefined,
    token: string | undefined,
  ): Promise<boolean> {
    if (!token || !forwardedUri) return false;

    let payload: MediaPlaybackTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<MediaPlaybackTokenPayload>(token);
    } catch {
      return false;
    }
    if (payload.typ !== 'media' || !payload.mediaId) return false;

    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: payload.mediaId, deletedAt: null },
      select: { hlsPrefix: true, status: true },
    });
    if (!asset?.hlsPrefix || asset.status !== MediaAssetStatus.READY) {
      return false;
    }

    let pathname: string;
    try {
      pathname = new URL(forwardedUri, 'http://local').pathname;
    } catch {
      return false;
    }

    const prefix = `/media-cdn/${this.minio.bucket}/`;
    if (!pathname.startsWith(prefix)) return false;
    const objectKey = decodeURIComponent(pathname.slice(prefix.length));
    if (!objectKey || objectKey.includes('..')) return false;
    return objectKey.startsWith(asset.hlsPrefix);
  }

  /** Converte MEDIA_PLAYBACK_TOKEN_TTL (ex.: 5m) em segundos para presign. */
  private playbackTtlSeconds(): number {
    const raw =
      this.config.get<string>('MEDIA_PLAYBACK_TOKEN_TTL')?.trim() || '5m';
    const m = /^(\d+)\s*([smhd])$/i.exec(raw);
    if (!m) return 300;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult =
      unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return Math.max(60, Math.min(n * mult, 3600));
  }

  private async requireAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Mídia não encontrada');
    return asset;
  }

  private async assertCanAccessAsset(mediaId: string, user: AuthUser) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, deletedAt: null },
      include: {
        moduleVideo: {
          include: { module: { select: { courseId: true } } },
        },
      },
    });
    if (!asset?.moduleVideo) {
      if (user.role === RoleCode.ADM_MASTER || asset?.ownerId === user.id)
        return;
      throw new NotFoundException('Mídia não encontrada');
    }
    await this.access.assertCanView(asset.moduleVideo.module.courseId, user);
  }

  serialize(asset: {
    id: string;
    ownerId: string;
    moduleVideoId: string | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: bigint;
    status: MediaAssetStatus;
    storageKey: string;
    hlsPrefix: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      ownerId: asset.ownerId,
      moduleVideoId: asset.moduleVideoId,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes.toString(),
      status: asset.status,
      errorMessage: asset.errorMessage,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }
}

function extFromName(name: string, mime: string): string {
  const fromName = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  if (fromName && fromName.length <= 8) return fromName.toLowerCase();
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/x-msvideo') return '.avi';
  return '.mp4';
}
