/**
 * infra/redis/audit-counter-store.redis.ts — Redis implementation of AuditCounterStore.
 * DOC2 §2.7.4: mp:meal:{m}:auditCounter STRING (int)
 */

import type { Redis } from 'ioredis';
import type { AuditCounterStore } from '../../core/ports';

export class RedisAuditCounterStore implements AuditCounterStore {
  constructor(private readonly redis: Redis) {}

  private key(mealId: string): string {
    return `mp:meal:${mealId.trim()}:auditCounter`;
  }

  async increment(mealId: string, n = 1): Promise<number> {
    return this.redis.incrby(this.key(mealId), n);
  }

  async reset(mealId: string): Promise<void> {
    await this.redis.del(this.key(mealId));
  }

  async get(mealId: string): Promise<number> {
    const val = await this.redis.get(this.key(mealId));
    return val ? parseInt(val, 10) : 0;
  }
}
