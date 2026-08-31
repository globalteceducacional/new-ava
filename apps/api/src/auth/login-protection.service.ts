import {
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Rate limit + bloqueio temporário de login via Redis.
 * Contadores por identidade (login) e por IP.
 */
@Injectable()
export class LoginProtectionService implements OnModuleDestroy {
  private readonly logger = new Logger(LoginProtectionService.name);
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }

  private get maxFailures() {
    return Number(this.config.get('LOGIN_MAX_FAILURES') ?? 5);
  }

  private get lockoutSeconds() {
    return Number(this.config.get('LOGIN_LOCKOUT_SECONDS') ?? 900);
  }

  private get ipLimit() {
    return Number(this.config.get('LOGIN_IP_RATE_LIMIT') ?? 30);
  }

  private get ipWindowSeconds() {
    return Number(this.config.get('LOGIN_IP_RATE_WINDOW_SEC') ?? 300);
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async ensureConnected() {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }

  /** Rate limit por IP (Redis) — ativo em produção; Nest Throttler cobre o restante. */
  async assertIpAllowed(ip: string | undefined) {
    if (!ip) return;
    if (process.env.NODE_ENV !== 'production') return;
    try {
      await this.ensureConnected();
      const key = `auth:rl:ip:${ip}`;
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.ipWindowSeconds);
      }
      if (count > this.ipLimit) {
        throw new ForbiddenException(
          'Muitas tentativas a partir deste endereço. Tente mais tarde.',
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(
        `Redis indisponível para rate limit IP: ${err instanceof Error ? err.message : err}`,
      );
      throw new ForbiddenException(
        'Proteção de login temporariamente indisponível. Tente mais tarde.',
      );
    }
  }

  async assertNotLocked(login: string) {
    try {
      await this.ensureConnected();
      const locked = await this.redis.get(this.lockKey(login));
      if (locked) {
        throw new ForbiddenException(
          'Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.',
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(
        `Redis indisponível para lockout: ${err instanceof Error ? err.message : err}`,
      );
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException(
          'Proteção de login temporariamente indisponível. Tente mais tarde.',
        );
      }
    }
  }

  async recordFailure(login: string) {
    try {
      await this.ensureConnected();
      const failKey = this.failKey(login);
      const count = await this.redis.incr(failKey);
      if (count === 1) {
        await this.redis.expire(failKey, this.lockoutSeconds);
      }
      if (count >= this.maxFailures) {
        await this.redis.set(
          this.lockKey(login),
          '1',
          'EX',
          this.lockoutSeconds,
        );
        await this.redis.del(failKey);
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar tentativa: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async clearFailures(login: string) {
    try {
      await this.ensureConnected();
      await this.redis.del(this.failKey(login), this.lockKey(login));
    } catch {
      /* ignore */
    }
  }

  private failKey(login: string) {
    return `auth:fail:${login.trim().toLowerCase()}`;
  }

  private lockKey(login: string) {
    return `auth:lock:${login.trim().toLowerCase()}`;
  }
}
