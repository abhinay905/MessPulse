/**
 * infra/memory/rating-due-store.memory.ts — In-memory twin of RatingDueStore.
 * DOC3 §3.12, DOC3 §3.14.
 */

import type { RatingDueStore } from '../../core/ports';

interface RatingDueItem {
  sessionId: string;
  userId: string;
  dueAt: number;
  mealId?: string;
}

export class InMemoryRatingDueStore implements RatingDueStore {
  private items: RatingDueItem[] = [];

  async schedule(sessionId: string, userId: string, dueAt: number, mealId?: string): Promise<void> {
    const item: RatingDueItem = {
      sessionId: sessionId.trim(),
      userId: userId.trim(),
      dueAt,
    };
    if (mealId) {
      item.mealId = mealId.trim();
    }
    this.items.push(item);
  }

  async popDue(now: number): Promise<Array<{ sessionId: string; userId: string; mealId?: string }>> {
    const due = this.items.filter((item) => item.dueAt <= now);
    this.items = this.items.filter((item) => item.dueAt > now);
    return due.map((d) => ({
      sessionId: d.sessionId,
      userId: d.userId,
      ...(d.mealId ? { mealId: d.mealId } : {}),
    }));
  }

  clear(): void {
    this.items = [];
  }
}
