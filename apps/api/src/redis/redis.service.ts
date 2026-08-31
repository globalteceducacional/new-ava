import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Cliente Redis compartilhado (cache, throttling, etc.). */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private connectMutex: Promise<void> | null = null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
      // Conecta no boot (OnModuleInit); evita connect() no hot path.
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times) =>
        times <= 3 ? Math.min(times * 200, 1_000) : null,
    });
    this.client.on('error', (err) => {
      this.logger.warn(`Redis: ${err.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.ensureConnected();
    } catch (err) {
      this.logger.warn(
        `Redis indisponível no boot: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  get isReady() {
    return this.client.status === 'ready';
  }

  /**
   * Garante conexão. No hot path (throttle), preferir `isReady` e fail-open
   * em vez de esperar reconnect longo.
   */
  async ensureConnected() {
    if (this.client.status === 'ready') return;

    if (!this.connectMutex) {
      this.connectMutex = this.doConnect().finally(() => {
        this.connectMutex = null;
      });
    }
    await this.connectMutex;
  }

  private async doConnect() {
    if (this.client.status === 'ready') return;

    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
      return;
    }

    if (
      this.client.status === 'connecting' ||
      this.client.status === 'reconnecting'
    ) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Redis connect timeout'));
        }, 1_500);

        const onReady = () => {
          cleanup();
          resolve();
        };
        const onEnd = () => {
          cleanup();
          reject(new Error('Redis connection ended'));
        };
        const cleanup = () => {
          clearTimeout(timeout);
          this.client.off('ready', onReady);
          this.client.off('end', onEnd);
        };

        this.client.once('ready', onReady);
        this.client.once('end', onEnd);

        if (this.client.status === 'ready') {
          cleanup();
          resolve();
        }
      });
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      if (!this.isReady) await this.ensureConnected();
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    try {
      if (!this.isReady) await this.ensureConnected();
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar cache ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      if (!this.isReady) await this.ensureConnected();
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  /** Remove chaves por prefixo (SCAN + DEL). */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      if (!this.isReady) await this.ensureConnected();
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }
}
