/**
 * infra/memory/audit-counter-store.memory.ts — In-memory twin of AuditCounterStore.
 * DOC3 §3.12, DOC3 §3.24.
 */

import type { AuditCounterStore } from '../../core/ports';

export class InMemoryAuditCounterStore implements AuditCounterStore {
  private counters = new Map<string, number>();

  async increment(mealId: string, n = 1): Promise<number> {
    const current = this.counters.get(mealId.trim()) ?? 0;
    const next = current + n;
    this.counters.set(mealId.trim(), next);
    return next;
  }

  async reset(mealId: string): Promise<void> {
    this.counters.delete(mealId.trim());
  }

  async get(mealId: string): Promise<number> {
    return this.counters.get(mealId.trim()) ?? 0;
  }

  clear(): void {
    this.counters.clear();
  }
}
