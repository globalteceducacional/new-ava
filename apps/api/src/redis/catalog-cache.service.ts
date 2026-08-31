import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types';
import { RedisService } from './redis.service';

const PREFIX = 'ava:cache:catalog:';
const CATEGORIES_KEY = `${PREFIX}categories`;

/** Cache Redis para listagens de catálogo/categorias (TTL curto + invalidação). */
@Injectable()
export class CatalogCacheService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get ttlSec() {
    return Math.max(15, Number(this.config.get('CATALOG_CACHE_TTL_SEC') ?? 60));
  }

  categoriesKey() {
    return CATEGORIES_KEY;
  }

  catalogKey(user: AuthUser): string {
    if (user.role === 'ADM_MASTER') return `${PREFIX}courses:master`;
    if (user.role === 'ADM_INSTITUICAO') {
      const ids = [...user.institutionIds].sort().join(',') || 'none';
      return `${PREFIX}courses:inst:${ids}`;
    }
    if (user.role === 'PROFESSOR') {
      return `${PREFIX}courses:prof:${user.id}`;
    }
    return `${PREFIX}courses:other:${user.id}`;
  }

  getCategories<T>() {
    return this.redis.getJson<T>(this.categoriesKey());
  }

  setCategories(value: unknown) {
    return this.redis.setJson(this.categoriesKey(), value, this.ttlSec);
  }

  getCatalog<T>(user: AuthUser) {
    return this.redis.getJson<T>(this.catalogKey(user));
  }

  setCatalog(user: AuthUser, value: unknown) {
    return this.redis.setJson(this.catalogKey(user), value, this.ttlSec);
  }

  /** Invalida categorias + todos os catálogos em cache. */
  async invalidateAll() {
    await this.redis.delByPrefix(PREFIX);
  }
}
