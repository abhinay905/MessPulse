/**
 * infra/redis/entry-velocity-store.redis.ts — Redis implementation of EntryVelocityStore.
 * DOC2 §2.3.
 *
 * Uses a ZSET with score = timestamp (epoch ms) and member = eventId:index for idempotent replay.
 */

import type { Redis } from 'ioredis';
import type { EntryVelocityStore } from '../../core/ports';

export class RedisEntryVelocityStore implements EntryVelocityStore {
  constructor(private readonly redis: Redis) {}

  private key(mealId: string): string {
    return `mp:meal:${mealId}:entries`;
  }

  async record(mealId: string, eventId: string, at: number, n: number): Promise<void> {
    const count = Math.max(0, n);
    if (count === 0) {
      return;
    }

    const zsetKey = this.key(mealId);
    const multi = this.redis.multi();

    for (let i = 0; i < count; i++) {
      multi.zadd(zsetKey, at, `${eventId}:${i}`);
    }

    // Retain entries for 24h
    multi.expire(zsetKey, 86400);
    await multi.exec();
  }

  async countSince(mealId: string, sinceMs: number): Promise<number> {
    const zsetKey = this.key(mealId);
    return await this.redis.zcount(zsetKey, sinceMs, '+inf');
  }
}
