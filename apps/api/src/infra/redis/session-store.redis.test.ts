import Redis from 'ioredis';
import { afterAll, beforeEach, describe } from 'vitest';
import { runSessionStoreContractTests } from '../../testing/session-store.contract';
import { RedisSessionStore } from './session-store.redis';

describe('RedisSessionStore (Contract Implementation)', () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });

  beforeEach(async () => {
    // Clear test keys before each test
    const keys = await redis.keys('mp:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    const keys = await redis.keys('mp:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  runSessionStoreContractTests(() => new RedisSessionStore(redis));
});
