/**
 * infra/memory/zone-reading-store.memory.ts — In-memory twin of ZoneReadingStore.
 * DOC3 §3.12, DOC3 §3.19.
 */

import type { ZoneReadingStore } from '../../core/ports';

export class InMemoryZoneReadingStore implements ZoneReadingStore {
  private readings = new Map<string, { count: number; timestamp: number }>();

  private key(mealId: string, zoneId: string): string {
    return `${mealId.trim()}:${zoneId.trim()}`;
  }

  async save(mealId: string, zoneId: string, count: number, timestamp: number): Promise<void> {
    this.readings.set(this.key(mealId, zoneId), { count, timestamp });
  }

  async getLatest(mealId: string, zoneId: string): Promise<{ count: number; timestamp: number } | null> {
    return this.readings.get(this.key(mealId, zoneId)) ?? null;
  }

  clear(): void {
    this.readings.clear();
  }
}
