/**
 * testing/session-store.contract.ts — shared contract test suite for SessionStore implementations.
 * Proves substitutability between InMemorySessionStore and RedisSessionStore (Liskov Substitution Principle).
 * Strictly no Redis key prefixes in this file.
 */

import { describe, expect, it } from 'vitest';
import type { ActiveSession, SessionStore } from '../core/ports';

export function runSessionStoreContractTests(createStore: () => SessionStore | Promise<SessionStore>): void {
  const mealId = '20261017-lunch';
  const messId = 'hostel-mess-1';

  const makeSession = (
    userId: string,
    checkedInAt: number,
    hardExpiresAt: number,
    sessionId = `session-${userId}`
  ): ActiveSession => ({
    sessionId,
    userId,
    mealId,
    messId,
    checkedInAt,
    expectedStayEndsAt: checkedInAt + 18 * 60 * 1000,
    hardExpiresAt,
    geofence: 'inside',
    method: 'qr',
  });

  describe('SessionStore Contract Suite', () => {
    it('creates a session and returns "created"', async () => {
      const store = await createStore();
      const session = makeSession('user-1', 1_000_000, 2_000_000);

      const result = await store.start(session);
      expect(result).toBe('created');

      const active = await store.getActiveForUser('user-1', mealId);
      expect(active).not.toBeNull();
      expect(active?.sessionId).toBe(session.sessionId);
      expect(active?.userId).toBe('user-1');
    });

    it('returns "already_active" when start is called twice for same user and meal', async () => {
      const store = await createStore();
      const session1 = makeSession('user-dup', 1_000_000, 2_000_000, 'session-dup-1');
      const session2 = makeSession('user-dup', 1_000_100, 2_000_100, 'session-dup-2');

      const first = await store.start(session1);
      expect(first).toBe('created');

      const second = await store.start(session2);
      expect(second).toBe('already_active');

      // The original session remains active
      const active = await store.getActiveForUser('user-dup', mealId);
      expect(active?.sessionId).toBe('session-dup-1');
    });

    it('allows different users to check into the same meal', async () => {
      const store = await createStore();
      const sessionA = makeSession('user-a', 1_000_000, 2_000_000);
      const sessionB = makeSession('user-b', 1_000_000, 2_000_000);

      expect(await store.start(sessionA)).toBe('created');
      expect(await store.start(sessionB)).toBe('created');

      expect((await store.getActiveForUser('user-a', mealId))?.sessionId).toBe('session-user-a');
      expect((await store.getActiveForUser('user-b', mealId))?.sessionId).toBe('session-user-b');
    });

    it('allows the same user to check into different meals', async () => {
      const store = await createStore();
      const sessionLunch = makeSession('user-multi', 1_000_000, 2_000_000, 'session-lunch');
      const sessionDinner: ActiveSession = {
        ...sessionLunch,
        mealId: '20261017-dinner',
        sessionId: 'session-dinner',
      };

      expect(await store.start(sessionLunch)).toBe('created');
      expect(await store.start(sessionDinner)).toBe('created');

      expect((await store.getActiveForUser('user-multi', mealId))?.sessionId).toBe('session-lunch');
      expect((await store.getActiveForUser('user-multi', '20261017-dinner'))?.sessionId).toBe('session-dinner');
    });

    it('returns null for getActiveForUser when no session exists', async () => {
      const store = await createStore();
      const result = await store.getActiveForUser('non-existent-user', mealId);
      expect(result).toBeNull();
    });

    it('ends an active session and returns it', async () => {
      const store = await createStore();
      const session = makeSession('user-end', 1_000_000, 2_000_000);

      await store.start(session);
      const ended = await store.end('user-end', mealId);
      expect(ended).not.toBeNull();
      expect(ended?.sessionId).toBe(session.sessionId);

      // Subsequent lookup returns null
      expect(await store.getActiveForUser('user-end', mealId)).toBeNull();

      // Subsequent end returns null (idempotent)
      expect(await store.end('user-end', mealId)).toBeNull();
    });

    it('lists only unexpired active sessions for listActive', async () => {
      const store = await createStore();
      const now = 1_500_000;

      // Session 1: unexpired (expires at 2_000_000 > now)
      const sessionActive1 = makeSession('user-live-1', 1_000_000, 2_000_000);
      // Session 2: unexpired (expires at 1_600_000 > now)
      const sessionActive2 = makeSession('user-live-2', 1_000_000, 1_600_000);
      // Session 3: expired (expired at 1_400_000 <= now)
      const sessionExpired = makeSession('user-past', 1_000_000, 1_400_000);

      await store.start(sessionActive1);
      await store.start(sessionActive2);
      await store.start(sessionExpired);

      const activeList = await store.listActive(mealId, now);
      const activeIds = activeList.map((s) => s.userId).sort();

      expect(activeIds).toEqual(['user-live-1', 'user-live-2']);
    });

    it('removes only elapsed sessions with removeExpired and cleans up user locks', async () => {
      const store = await createStore();
      const now = 1_500_000;

      // Session 1: active (expires at 2_000_000 > now)
      const liveSession = makeSession('user-live', 1_000_000, 2_000_000);
      // Session 2: expired (expires at 1_400_000 <= now)
      const expSession1 = makeSession('user-exp-1', 1_000_000, 1_400_000);
      // Session 3: expired exactly at now (1_500_000 <= now)
      const expSession2 = makeSession('user-exp-2', 1_000_000, 1_500_000);

      await store.start(liveSession);
      await store.start(expSession1);
      await store.start(expSession2);

      const removed = await store.removeExpired(mealId, now);
      const removedIds = removed.map((s) => s.userId).sort();

      expect(removedIds).toEqual(['user-exp-1', 'user-exp-2']);

      // Live session is still active
      const remainingActive = await store.listActive(mealId, now);
      expect(remainingActive.map((s) => s.userId)).toEqual(['user-live']);

      // Expired user lock is released — user-exp-1 can check in again
      const newSession = makeSession('user-exp-1', now, now + 1_000_000, 'session-new');
      const startResult = await store.start(newSession);
      expect(startResult).toBe('created');
    });

    it('returns empty array when removeExpired finds no elapsed sessions', async () => {
      const store = await createStore();
      const now = 1_000_000;
      const liveSession = makeSession('user-live-only', now, now + 500_000);
      await store.start(liveSession);

      const removed = await store.removeExpired(mealId, now);
      expect(removed).toEqual([]);
    });
  });
}
