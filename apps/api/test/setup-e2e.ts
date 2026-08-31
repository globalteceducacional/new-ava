import Redis from 'ioredis';

/**
 * Limpa contadores/locks de login entre suites e2e (evita 403 residual no Redis).
 */
beforeAll(async () => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  try {
    await redis.connect();
    const keys = await redis.keys('auth:*');
    if (keys.length) await redis.del(...keys);
  } catch {
    /* Redis pode estar indisponível em alguns jobs — suites que dependem falharão sozinhas */
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
});
