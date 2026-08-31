import { Injectable } from '@nestjs/common';
import { hostname } from 'os';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import type { HealthResponse } from './health.types';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const [db, redis, minio] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMinio(),
    ]);
    // Só o Postgres derruba o LB (Docker HEALTHCHECK / Caddy health_uri).
    // Redis/MinIO são informativos: cache/throttle já são fail-open.
    const status = db === 'ok' ? 'ok' : 'degraded';
    return {
      status,
      db,
      redis,
      minio,
      host: hostname(),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    } finally {
      client.disconnect();
    }
  }

  private async checkMinio(): Promise<'ok' | 'error' | 'skipped'> {
    const endpoint = process.env.MINIO_ENDPOINT;
    if (!endpoint) return 'skipped';
    const port = process.env.MINIO_PORT ?? '9000';
    const useSsl = process.env.MINIO_USE_SSL === 'true';
    const url = `${useSsl ? 'https' : 'http'}://${endpoint}:${port}/minio/health/live`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
