/**
 * infra/memory/entry-velocity-store.memory.ts — in-memory implementation of EntryVelocityStore.
 * Used for testing and emergency standalone fallback.
 */

import type { EntryVelocityStore } from '../../core/ports';

interface RecordedEntry {
  eventId: string;
  at: number;
}

export class InMemoryEntryVelocityStore implements EntryVelocityStore {
  private readonly mealEntries = new Map<string, Map<string, RecordedEntry>>();

  async record(mealId: string, eventId: string, at: number, n: number): Promise<void> {
    let mealMap = this.mealEntries.get(mealId);
    if (!mealMap) {
      mealMap = new Map();
      this.mealEntries.set(mealId, mealMap);
    }

    const count = Math.max(0, n);
    for (let i = 0; i < count; i++) {
      const subId = `${eventId}:${i}`;
      if (!mealMap.has(subId)) {
        mealMap.set(subId, { eventId: subId, at });
      }
    }
  }

  async countSince(mealId: string, sinceMs: number): Promise<number> {
    const mealMap = this.mealEntries.get(mealId);
    if (!mealMap) {
      return 0;
    }

    let count = 0;
    for (const entry of mealMap.values()) {
      if (entry.at >= sinceMs) {
        count++;
      }
    }
    return count;
  }
}
