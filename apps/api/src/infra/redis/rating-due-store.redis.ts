/**
 * infra/redis/rating-due-store.redis.ts — Redis implementation of RatingDueStore.
 * DOC2 §2.7.4: mp:meal:{m}:ratingdue (or mp:ratingdue) ZSET (score = dueAt, member = sessionId|userId).
 */

import type { Redis } from 'ioredis';
import type { RatingDueStore } from '../../core/ports';

export class RedisRatingDueStore implements RatingDueStore {
  private readonly defaultKey = 'mp:ratingdue';

  constructor(private readonly redis: Redis) {}

  private key(mealId?: string): string {
    return mealId ? `mp:meal:${mealId}:ratingdue` : this.defaultKey;
  }

  async schedule(sessionId: string, userId: string, dueAt: number, mealId?: string): Promise<void> {
    const member = `${sessionId.trim()}|${userId.trim()}${mealId ? `|${mealId.trim()}` : ''}`;
    // Add to specific meal key if provided and also global key for fast single-zrangebyscore polling
    const multi = this.redis.multi();
    multi.zadd(this.defaultKey, dueAt, member);
    if (mealId) {
      multi.zadd(this.key(mealId), dueAt, member);
    }
    await multi.exec();
  }

  async popDue(now: number): Promise<Array<{ sessionId: string; userId: string; mealId?: string }>> {
    // Atomic pop using Lua script
    const luaScript = `
      local due = redis.call('zrangebyscore', KEYS[1], '-inf', ARGV[1])
      if #due > 0 then
        redis.call('zremrangebyscore', KEYS[1], '-inf', ARGV[1])
      end
      return due
    `;
    const members = (await this.redis.eval(luaScript, 1, this.defaultKey, now)) as string[];
    if (!members || members.length === 0) {
      return [];
    }

    return members.map((m) => {
      const parts = m.split('|');
      const sessionId = parts[0] ?? '';
      const userId = parts[1] ?? '';
      const mealId = parts[2];
      return { sessionId, userId, ...(mealId ? { mealId } : {}) };
    });
  }
}
