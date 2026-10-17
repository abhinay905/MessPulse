/**
 * infra/redis/zone-reading-store.redis.ts — Redis implementation of ZoneReadingStore.
 * DOC2 §2.7.4: mp:meal:{m}:zone:{zoneId} STRING (JSON latest zone reading).
 */

import type { Redis } from 'ioredis';
import type { ZoneReadingStore } from '../../core/ports';

export class RedisZoneReadingStore implements ZoneReadingStore {
  constructor(private readonly redis: Redis) {}

  private key(mealId: string, zoneId: string): string {
    return `mp:meal:${mealId.trim()}:zone:${zoneId.trim()}`;
  }

  async save(mealId: string, zoneId: string, count: number, timestamp: number): Promise<void> {
    const payload = JSON.stringify({ count, timestamp });
    // 24 hours TTL
    await this.redis.set(this.key(mealId, zoneId), payload, 'EX', 86400);
  }

  async getLatest(mealId: string, zoneId: string): Promise<{ count: number; timestamp: number } | null> {
    const data = await this.redis.get(this.key(mealId, zoneId));
    if (!data) return null;
    try {
      return JSON.parse(data) as { count: number; timestamp: number };
    } catch {
      return null;
    }
  }
}
