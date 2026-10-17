/**
 * infra/redis/manual-queue-store.redis.ts — Redis implementation of ManualQueueStore.
 * DOC2 §2.7.4: mp:meal:{m}:queueManual:{counterId} STRING + TTL 10 min.
 */

import type { Redis } from 'ioredis';
import type { ManualQueueStore } from '../../core/ports';

export class RedisManualQueueStore implements ManualQueueStore {
  constructor(private readonly redis: Redis) {}

  private key(mealId: string, counterId: string): string {
    return `mp:meal:${mealId.trim()}:queueManual:${counterId.trim()}`;
  }

  async set(mealId: string, counterId: string, length: number, ttlSec = 600): Promise<void> {
    await this.redis.set(this.key(mealId, counterId), length.toString(), 'EX', ttlSec);
  }

  async get(mealId: string, counterId: string): Promise<number | null> {
    const val = await this.redis.get(this.key(mealId, counterId));
    return val !== null ? parseInt(val, 10) : null;
  }
}
