import { describe, expect, it } from 'vitest';
import type { CameraReading } from '../../core/ports';
import { InMemoryCameraReadingStore } from './camera-reading-store.memory';
import { InMemoryEntryVelocityStore } from './entry-velocity-store.memory';
import { InMemoryOtpStore } from './otp-store.memory';

describe('InMemory Stores', () => {
  describe('InMemoryEntryVelocityStore', () => {
    it('records entries idempotently and counts entries since timestamp', async () => {
      const store = new InMemoryEntryVelocityStore();
      const mealId = 'meal-vel-test';

      await store.record(mealId, 'evt-1', 1000, 3);
      // Re-recording the same event should be idempotent
      await store.record(mealId, 'evt-1', 1000, 3);
      await store.record(mealId, 'evt-2', 2000, 2);
      await store.record(mealId, 'evt-3', 3000, 5);

      // countSince 2000 ms: should count evt-2 (2) and evt-3 (5) = 7
      const count = await store.countSince(mealId, 2000);
      expect(count).toBe(7);

      // countSince 1000 ms: all = 3 + 2 + 5 = 10
      expect(await store.countSince(mealId, 1000)).toBe(10);

      // countSince 4000 ms: none = 0
      expect(await store.countSince(mealId, 4000)).toBe(0);

      // Unknown meal returns 0
      expect(await store.countSince('other-meal', 0)).toBe(0);
    });
  });

  describe('InMemoryCameraReadingStore', () => {
    it('saves and retrieves latest camera reading', async () => {
      const store = new InMemoryCameraReadingStore();
      const mealId = 'meal-cam-test';

      expect(await store.getLatest(mealId)).toBeNull();

      const reading: CameraReading = {
        seq: 1,
        count: 42,
        inCount: 100,
        outCount: 58,
        capturedAt: 1_000_000,
        receivedAt: 1_000_050,
      };

      await store.saveLatest(mealId, reading);
      const retrieved = await store.getLatest(mealId);
      expect(retrieved).toEqual(reading);

      // Overwrite with newer reading
      const reading2: CameraReading = {
        ...reading,
        seq: 2,
        count: 45,
      };
      await store.saveLatest(mealId, reading2);
      expect(await store.getLatest(mealId)).toEqual(reading2);
    });
  });

  describe('InMemoryOtpStore', () => {
    it('sets, gets, increments attempts and deletes OTP', async () => {
      const store = new InMemoryOtpStore();
      const email = 'student@campus.edu';
      const hash = 'hashed-otp-secret-value';

      expect(await store.get(email)).toBeNull();

      await store.set(email, hash, 600);
      expect(await store.get(email)).toBe(hash);

      // Normalization check (case insensitivity)
      expect(await store.get('STUDENT@CAMPUS.EDU')).toBe(hash);

      // Increment attempts
      expect(await store.incrementAttempts(email)).toBe(1);
      expect(await store.incrementAttempts(email)).toBe(2);
      expect(await store.incrementAttempts('unknown@campus.edu')).toBe(0);

      // Delete
      await store.delete(email);
      expect(await store.get(email)).toBeNull();
    });

    it('returns null for expired OTP', async () => {
      const store = new InMemoryOtpStore();
      const email = 'expired@campus.edu';
      // -10s TTL
      await store.set(email, 'hash', -10);
      expect(await store.get(email)).toBeNull();
    });
  });
});
