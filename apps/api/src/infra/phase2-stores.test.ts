/**
 * infra/phase2-stores.test.ts — Unit tests for Phase 2 stores & adapters.
 * Covers memory twins, LocalDiskStorage, and NoopNotifier.
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { InMemoryRatingDueStore } from './memory/rating-due-store.memory';
import { InMemoryAuditCounterStore } from './memory/audit-counter-store.memory';
import { InMemoryZoneReadingStore } from './memory/zone-reading-store.memory';
import { InMemoryManualQueueStore } from './memory/manual-queue-store.memory';
import { LocalDiskStorage } from './storage/local-disk.storage';
import { NoopNotifier } from './push/noop.notifier';

describe('Phase 2 Stores & Adapters', () => {
  describe('InMemoryRatingDueStore', () => {
    it('schedules and pops due ratings', async () => {
      const store = new InMemoryRatingDueStore();
      await store.schedule('s1', 'u1', 1000);
      await store.schedule('s2', 'u2', 2000, 'm1');

      // At t=1500, only s1 is due
      const due1 = await store.popDue(1500);
      expect(due1).toEqual([{ sessionId: 's1', userId: 'u1' }]);

      // Pop again at t=1500 -> empty
      const dueEmpty = await store.popDue(1500);
      expect(dueEmpty).toHaveLength(0);

      // At t=2500, s2 is due with mealId
      const due2 = await store.popDue(2500);
      expect(due2).toEqual([{ sessionId: 's2', userId: 'u2', mealId: 'm1' }]);
    });
  });

  describe('InMemoryAuditCounterStore', () => {
    it('increments, gets, and resets counter', async () => {
      const store = new InMemoryAuditCounterStore();
      expect(await store.get('m1')).toBe(0);

      const n1 = await store.increment('m1');
      expect(n1).toBe(1);

      const n5 = await store.increment('m1', 4);
      expect(n5).toBe(5);
      expect(await store.get('m1')).toBe(5);

      await store.reset('m1');
      expect(await store.get('m1')).toBe(0);
    });
  });

  describe('InMemoryZoneReadingStore', () => {
    it('saves and gets latest zone reading', async () => {
      const store = new InMemoryZoneReadingStore();
      expect(await store.getLatest('m1', 'regular')).toBeNull();

      await store.save('m1', 'regular', 14, 1700000000);
      const reading = await store.getLatest('m1', 'regular');
      expect(reading).toEqual({ count: 14, timestamp: 1700000000 });
    });
  });

  describe('InMemoryManualQueueStore', () => {
    it('sets and gets queue length with expiry', async () => {
      const store = new InMemoryManualQueueStore();
      expect(await store.get('m1', 'counter-1')).toBeNull();

      await store.set('m1', 'counter-1', 8, 600);
      expect(await store.get('m1', 'counter-1')).toBe(8);
    });
  });

  describe('LocalDiskStorage', () => {
    it('puts, gets url, and deletes files safely', async () => {
      const testDir = path.join(os.tmpdir(), `messpulse-test-${Date.now()}`);
      const storage = new LocalDiskStorage(testDir);

      const buf = Buffer.from('fake image content');
      const key = 'test-image-123';
      const savedKey = await storage.put(key, buf, 'image/jpeg');
      expect(savedKey).toBe(key);

      const url = await storage.getSignedUrl(key);
      expect(url).toBe(`/api/v1/storage/${key}`);

      await storage.delete(key);
      // Second delete should not throw
      await expect(storage.delete(key)).resolves.not.toThrow();
    });
  });

  describe('NoopNotifier', () => {
    it('sends push without throwing', async () => {
      const notifier = new NoopNotifier();
      await expect(
        notifier.send('u1', { title: 'Test', body: 'Test push notification' })
      ).resolves.not.toThrow();
    });
  });
});
