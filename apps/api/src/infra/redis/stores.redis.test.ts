import Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CameraReading } from '../../core/ports';
import { RedisCameraReadingStore } from './camera-reading-store.redis';
import { RedisEntryVelocityStore } from './entry-velocity-store.redis';
import { RedisOtpStore } from './otp-store.redis';

describe('Redis Stores', () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });

  beforeEach(async () => {
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

  describe('RedisEntryVelocityStore', () => {
    it('records entries idempotently and counts entries since timestamp', async () => {
      const store = new RedisEntryVelocityStore(redis);
      const mealId = 'meal-vel-redis-test';

      await store.record(mealId, 'evt-1', 1000, 3);
      // Idempotent re-recording
      await store.record(mealId, 'evt-1', 1000, 3);
      await store.record(mealId, 'evt-2', 2000, 2);
      await store.record(mealId, 'evt-3', 3000, 5);

      const countSince2000 = await store.countSince(mealId, 2000);
      expect(countSince2000).toBe(7);

      const countSince1000 = await store.countSince(mealId, 1000);
      expect(countSince1000).toBe(10);

      const countSince4000 = await store.countSince(mealId, 4000);
      expect(countSince4000).toBe(0);

      // 0 entries does nothing
      await store.record(mealId, 'evt-0', 1000, 0);
    });
  });

  describe('RedisCameraReadingStore', () => {
    it('saves and retrieves latest camera reading', async () => {
      const store = new RedisCameraReadingStore(redis);
      const mealId = 'meal-cam-redis-test';

      expect(await store.getLatest(mealId)).toBeNull();

      const reading: CameraReading = {
        seq: 1,
        count: 55,
        inCount: 120,
        outCount: 65,
        capturedAt: 2_000_000,
        receivedAt: 2_000_030,
      };

      await store.saveLatest(mealId, reading);
      const retrieved = await store.getLatest(mealId);
      expect(retrieved).toEqual(reading);

      // Overwrite
      const reading2: CameraReading = {
        ...reading,
        seq: 2,
        count: 60,
      };
      await store.saveLatest(mealId, reading2);
      expect(await store.getLatest(mealId)).toEqual(reading2);
    });
  });

  describe('RedisOtpStore', () => {
    it('sets, gets, increments attempts and deletes OTP', async () => {
      const store = new RedisOtpStore(redis);
      const email = 'user@campus.edu';
      const hash = 'hashed-otp-string';

      expect(await store.get(email)).toBeNull();

      await store.set(email, hash, 600);
      expect(await store.get(email)).toBe(hash);

      // Case insensitive
      expect(await store.get('USER@CAMPUS.EDU')).toBe(hash);

      // Increment attempts
      expect(await store.incrementAttempts(email)).toBe(1);
      expect(await store.incrementAttempts(email)).toBe(2);

      // Delete
      await store.delete(email);
      expect(await store.get(email)).toBeNull();
    });
  });
});
