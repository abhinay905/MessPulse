/**
 * infra/memory/manual-queue-store.memory.ts — In-memory twin of ManualQueueStore.
 * DOC3 §3.12, DOC3 §3.19.
 */

import type { ManualQueueStore } from '../../core/ports';

interface ManualQueueItem {
  length: number;
  expiresAt: number;
}

export class InMemoryManualQueueStore implements ManualQueueStore {
  private queues = new Map<string, ManualQueueItem>();

  private key(mealId: string, counterId: string): string {
    return `${mealId.trim()}:${counterId.trim()}`;
  }

  async set(mealId: string, counterId: string, length: number, ttlSec = 600): Promise<void> {
    const expiresAt = Date.now() + ttlSec * 1000;
    this.queues.set(this.key(mealId, counterId), { length, expiresAt });
  }

  async get(mealId: string, counterId: string): Promise<number | null> {
    const item = this.queues.get(this.key(mealId, counterId));
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.queues.delete(this.key(mealId, counterId));
      return null;
    }
    return item.length;
  }

  clear(): void {
    this.queues.clear();
  }
}
