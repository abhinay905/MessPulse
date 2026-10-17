/**
 * infra/redis/camera-reading-store.redis.ts — Redis implementation of CameraReadingStore.
 * DOC2 §2.3.
 */

import type { Redis } from 'ioredis';
import type { CameraReading, CameraReadingStore } from '../../core/ports';

export class RedisCameraReadingStore implements CameraReadingStore {
  constructor(private readonly redis: Redis) {}

  private key(mealId: string): string {
    return `mp:meal:${mealId}:camera`;
  }

  async saveLatest(mealId: string, reading: CameraReading): Promise<void> {
    const key = this.key(mealId);
    await this.redis.set(key, JSON.stringify(reading), 'EX', 86400);
  }

  async getLatest(mealId: string): Promise<CameraReading | null> {
    const key = this.key(mealId);
    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as CameraReading;
  }
}
