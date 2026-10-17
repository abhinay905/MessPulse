/**
 * infra/memory/session-store.memory.ts — in-memory implementation of SessionStore.
 * Used for testing and emergency standalone fallback.
 * Strictly no Redis key names (information hiding).
 */

import type { ActiveSession, SessionStore } from '../../core/ports';

export class InMemorySessionStore implements SessionStore {
  private readonly userMealSessions = new Map<string, ActiveSession>();
  private readonly mealSessions = new Map<string, Map<string, ActiveSession>>();

  async start(session: ActiveSession): Promise<'created' | 'already_active'> {
    const userMealKey = `${session.userId}:${session.mealId}`;
    if (this.userMealSessions.has(userMealKey)) {
      return 'already_active';
    }

    const sessionCopy: ActiveSession = { ...session };
    this.userMealSessions.set(userMealKey, sessionCopy);

    let sessionsForMeal = this.mealSessions.get(session.mealId);
    if (!sessionsForMeal) {
      sessionsForMeal = new Map();
      this.mealSessions.set(session.mealId, sessionsForMeal);
    }
    sessionsForMeal.set(session.sessionId, sessionCopy);

    return 'created';
  }

  async getActiveForUser(userId: string, mealId: string): Promise<ActiveSession | null> {
    const userMealKey = `${userId}:${mealId}`;
    const session = this.userMealSessions.get(userMealKey);
    return session ? { ...session } : null;
  }

  async end(userId: string, mealId: string): Promise<ActiveSession | null> {
    const userMealKey = `${userId}:${mealId}`;
    const session = this.userMealSessions.get(userMealKey);
    if (!session) {
      return null;
    }

    this.userMealSessions.delete(userMealKey);
    const sessionsForMeal = this.mealSessions.get(mealId);
    if (sessionsForMeal) {
      sessionsForMeal.delete(session.sessionId);
    }

    return { ...session };
  }

  async listActive(mealId: string, now: number): Promise<ActiveSession[]> {
    const sessionsForMeal = this.mealSessions.get(mealId);
    if (!sessionsForMeal) {
      return [];
    }

    const active: ActiveSession[] = [];
    for (const session of sessionsForMeal.values()) {
      if (session.hardExpiresAt > now) {
        active.push({ ...session });
      }
    }
    return active;
  }

  async removeExpired(mealId: string, now: number): Promise<ActiveSession[]> {
    const sessionsForMeal = this.mealSessions.get(mealId);
    if (!sessionsForMeal) {
      return [];
    }

    const expired: ActiveSession[] = [];
    for (const session of Array.from(sessionsForMeal.values())) {
      if (session.hardExpiresAt <= now) {
        expired.push({ ...session });
        sessionsForMeal.delete(session.sessionId);
        this.userMealSessions.delete(`${session.userId}:${mealId}`);
      }
    }

    return expired;
  }
}
