import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: S3Client;
  /**
   * Cliente para presign quando MEDIA_PUBLIC_BASE_URL aponta direto ao MinIO
   * (ex.: http://localhost:9000). Com path no Caddy (/media-cdn) usamos JWT + forward_auth.
   */
  private readonly publicClient: S3Client | null;
  readonly bucket: string;
  readonly publicBaseUrl: string | null;
  /**
   * true = URL pública tem path (ex.: /media-cdn) → segmentos com ?token= + Caddy forward_auth.
   * false = base é o endpoint S3 → URL assinada SigV4.
   */
  readonly useCdnTokenOffload: boolean;
  /**
   * Offload ativo para o player. Em modo MinIO direto (presign), só liga se o CORS
   * do bucket for aplicado — senão o browser fica com tela preta e o Nest faz proxy.
   */
  private hlsOffloadActive = false;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = this.config.get<string>('MINIO_PORT') ?? '9000';
    const useSsl = this.config.get<string>('MINIO_USE_SSL') === 'true';
    this.bucket = this.config.get<string>('MINIO_BUCKET') ?? 'ava-media';
    const credentials = {
      accessKeyId:
        this.config.get<string>('MINIO_ACCESS_KEY') ??
        this.config.get<string>('MINIO_ROOT_USER') ??
        'ava_minio',
      secretAccessKey:
        this.config.get<string>('MINIO_SECRET_KEY') ??
        this.config.get<string>('MINIO_ROOT_PASSWORD') ??
        'ava_minio_secret',
    };

    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials,
      // MinIO não implementa checksums default do AWS SDK v3 (“functionality not implemented”).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    const publicBase = (this.config.get<string>('MEDIA_PUBLIC_BASE_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    this.publicBaseUrl = publicBase || null;

    let useCdnToken = false;
    let publicClient: S3Client | null = null;
    if (this.publicBaseUrl) {
      try {
        const u = new URL(this.publicBaseUrl);
        useCdnToken = (u.pathname || '/') !== '/';
      } catch {
        useCdnToken = true;
      }
      if (!useCdnToken) {
        publicClient = new S3Client({
          region: 'us-east-1',
          endpoint: this.publicBaseUrl,
          forcePathStyle: true,
          credentials,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        });
      }
      this.logger.log(
        useCdnToken
          ? `HLS offload (Caddy+token): ${this.publicBaseUrl}`
          : `HLS offload (presign MinIO): ${this.publicBaseUrl}`,
      );
    }
    this.useCdnTokenOffload = useCdnToken;
    this.publicClient = publicClient;
  }

  async onModuleInit() {
    await this.ensureBucket();
    if (!this.publicBaseUrl) {
      this.hlsOffloadActive = false;
      return;
    }
    if (this.useCdnTokenOffload) {
      // Mesmo origin via Caddy — não depende de CORS do MinIO.
      this.hlsOffloadActive = true;
      return;
    }
    const corsOk = await this.ensureCors();
    this.hlsOffloadActive = corsOk;
    if (!corsOk) {
      this.logger.warn(
        'HLS offload MinIO desativado nesta sessão (CORS falhou). Segmentos passam pela API.',
      );
    }
  }

  /** true = playlists reescrevem segmentos para URL pública (MinIO/CDN). */
  get hlsOffloadEnabled() {
    return this.hlsOffloadActive && Boolean(this.publicBaseUrl);
  }

  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Criando bucket MinIO: ${this.bucket}`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  /** CORS para o player buscar segmentos assinados no MinIO (modo local). */
  private async ensureCors(): Promise<boolean> {
    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3001';
    // MinIO recente rejeita alguns ExposeHeaders do S3 (“functionality not implemented”).
    const origins = Array.from(
      new Set([webOrigin, 'http://localhost:3001', 'http://127.0.0.1:3001']),
    );
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: origins,
                AllowedMethods: ['GET', 'HEAD'],
                AllowedHeaders: ['*'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
      this.logger.log(`CORS MinIO liberado para ${origins.join(', ')}`);
      return true;
    } catch (err) {
      this.logger.warn(
        `Não foi possível configurar CORS no MinIO: ${
          err instanceof Error ? err.message : String(err)
        }. Sem CORS, o player no browser não carrega segmentos de ${this.publicBaseUrl}.`,
      );
      return false;
    }
  }

  async putObject(
    key: string,
    body: Buffer | Uint8Array | Readable,
    contentType?: string,
    contentLength?: number,
  ) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(contentLength != null ? { ContentLength: contentLength } : {}),
      }),
    );
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer | Uint8Array | string));
    }
    return Buffer.concat(chunks);
  }

  async getObjectStream(key: string): Promise<{
    body: Readable;
    contentType?: string;
    contentLength?: number;
  }> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      body: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }

  async signedGetUrl(key: string, expiresInSec = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  /** Presign no endpoint público (só modo MinIO direto, sem path no Caddy). */
  async signedPublicGetUrl(
    key: string,
    expiresInSec = 300,
  ): Promise<string | null> {
    if (!this.publicClient) return null;
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * URL pública do segmento no CDN (Caddy): /media-cdn/{bucket}/{key}?token=...
   */
  cdnObjectUrl(key: string, token: string): string | null {
    if (!this.publicBaseUrl || !this.useCdnTokenOffload) return null;
    const path = `${this.publicBaseUrl}/${this.bucket}/${key}`.replace(
      /([^:]\/)\/+/g,
      '$1',
    );
    return `${path}?token=${encodeURIComponent(token)}`;
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getObjectStream(key);
      return true;
    } catch {
      return false;
    }
  }
}
