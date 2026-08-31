import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CatalogCacheService } from './catalog-cache.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  providers: [RedisService, CatalogCacheService, RedisThrottlerStorage],
  exports: [RedisService, CatalogCacheService, RedisThrottlerStorage],
})
export class RedisModule {}
