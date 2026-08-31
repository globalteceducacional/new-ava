import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

type StorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Storage Redis para ThrottlerGuard — multi-réplica.
 * Fail-open imediato se Redis não estiver ready (sem esperar reconnect).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    // Hot path: não chama ensureConnected (evita timeout em cada request).
    if (!this.redis.isReady) {
      return {
        totalHits: 0,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    try {
      const redisKey = `ava:throttle:${throttlerName}:${key}`;
      const pipeline = this.redis.client.pipeline();
      pipeline.incr(redisKey);
      pipeline.pttl(redisKey);
      const results = await pipeline.exec();

      const hits = Number(results?.[0]?.[1] ?? 0);
      let timeToExpire = Number(results?.[1]?.[1] ?? -1);

      if (hits === 1 || timeToExpire < 0) {
        await this.redis.client.pexpire(redisKey, ttl);
        timeToExpire = ttl;
      }

      const isBlocked = hits > limit;
      let timeToBlockExpire = 0;
      if (isBlocked && blockDuration > 0) {
        const blockKey = `${redisKey}:block`;
        const blockTtl = await this.redis.client.pttl(blockKey);
        if (blockTtl < 0) {
          await this.redis.client.set(blockKey, '1', 'PX', blockDuration);
          timeToBlockExpire = blockDuration;
        } else {
          timeToBlockExpire = blockTtl;
        }
      }

      return {
        totalHits: hits,
        timeToExpire: Math.max(0, timeToExpire),
        isBlocked,
        timeToBlockExpire,
      };
    } catch {
      return {
        totalHits: 0,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
