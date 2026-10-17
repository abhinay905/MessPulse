/**
 * infra/mongo/mongo-repositories.test.ts — Integration tests for MongoDB repositories.
 * Runs against real MongoDB service container on port 27017.
 * Verifies plain typed objects are returned (no Mongoose documents leaked).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from './connection';
import { AlertModel } from './models/alert.model';
import { CheckInModel } from './models/check-in.model';
import { MealModel } from './models/meal.model';
import { MessSettingsModel } from './models/mess-settings.model';
import { OccupancySnapshotModel } from './models/occupancy-snapshot.model';
import { UserModel } from './models/user.model';
import { MongoAlertRepository } from './alert.repository';
import { MongoCheckInRepository } from './check-in.repository';
import { MongoMealRepository } from './meal.repository';
import { MongoSettingsRepository } from './mess-settings.repository';
import { MongoSnapshotRepository } from './snapshot.repository';
import { MongoUserRepository } from './user.repository';

describe('MongoDB Repositories Integration Suite', () => {
  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  beforeEach(async () => {
    // Clear collections between tests for isolation
    await UserModel.deleteMany({});
    await MessSettingsModel.deleteMany({});
    await MealModel.deleteMany({});
    await CheckInModel.deleteMany({});
    await OccupancySnapshotModel.deleteMany({});
    await AlertModel.deleteMany({});
  });

  describe('MongoUserRepository', () => {
    const repo = new MongoUserRepository();

    it('upserts student and returns plain typed object', async () => {
      const student = await repo.upsertStudent('student1@hostel.edu', 'Aarav Patel');
      expect(student).toBeDefined();
      expect(student.email).toBe('student1@hostel.edu');
      expect(student.name).toBe('Aarav Patel');
      expect(student.role).toBe('student');
      expect(typeof student.id).toBe('string');
      // Verify not a mongoose document
      expect((student as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const fetched = await repo.findByEmail('STUDENT1@HOSTEL.EDU');
      expect(fetched?.id).toBe(student.id);

      const byId = await repo.findById(student.id as string);
      expect(byId?.email).toBe('student1@hostel.edu');
    });

    it('creates staff/admin user with pinHash', async () => {
      const staff = await repo.createStaffOrAdmin({
        email: 'staff@hostel.edu',
        name: 'Staff Lead',
        role: 'staff',
        pinHash: 'hashed-pin-1234',
      });
      expect(staff.role).toBe('staff');
      expect(staff.pinHash).toBe('hashed-pin-1234');
    });
  });

  describe('MongoSettingsRepository', () => {
    const repo = new MongoSettingsRepository();

    it('upserts and retrieves mess settings', async () => {
      const settings = await repo.upsert({
        messId: 'mess-alpha',
        name: 'Alpha Dining',
        seatCapacity: 250,
        servicePerMin: 18,
        geofence: { lat: 12.97, lng: 77.59, radiusM: 120 },
        baseMealMin: 18,
        maxSessionMin: 60,
        decay: {
          tail: [
            { untilOffsetMin: 8, weight: 0.6 },
            { untilOffsetMin: 17, weight: 0.25 },
          ],
        },
        staleCameraSec: 30,
        alertThresholds: { warnRatio: 0.85 },
      });

      expect(settings.messId).toBe('mess-alpha');
      expect(settings.seatCapacity).toBe(250);

      const retrieved = await repo.getByMessId('mess-alpha');
      expect(retrieved?.id).toBe(settings.id);
      expect(retrieved?.decay.tail).toHaveLength(2);
    });
  });

  describe('MongoMealRepository', () => {
    const repo = new MongoMealRepository();

    it('upserts meal, finds active, and updates tray capacity', async () => {
      const now = Date.now();
      const meal = await repo.upsert({
        messId: 'mess-alpha',
        mealId: '20261017-lunch',
        type: 'lunch',
        startsAt: now - 30 * 60 * 1000,
        endsAt: now + 60 * 60 * 1000,
        menuItems: ['Rice', 'Dal', 'Paneer'],
        menuDemandFactorMin: 2,
        trayCapacity: 300,
      });

      expect(meal.mealId).toBe('20261017-lunch');

      const active = await repo.findActiveAt('mess-alpha', now);
      expect(active?.mealId).toBe('20261017-lunch');

      const updated = await repo.updateTrayCapacity('mess-alpha', '20261017-lunch', 450);
      expect(updated?.trayCapacity).toBe(450);
    });
  });

  describe('MongoCheckInRepository', () => {
    const repo = new MongoCheckInRepository();

    it('archives check-ins and retrieves by sessionId or meal', async () => {
      const checkIn1 = {
        sessionId: 'sess-1',
        userId: 'u1',
        mealId: '20261017-lunch',
        checkedInAt: 1_000_000,
        queueWaitSecAtEntry: 120,
        expectedStaySec: 1080,
        hardExpirySec: 2100,
        method: 'qr' as const,
        geofence: 'inside' as const,
        endReason: 'expired' as const,
      };

      const checkIn2 = {
        sessionId: 'sess-2',
        userId: 'u2',
        mealId: '20261017-lunch',
        checkedInAt: 1_001_000,
        queueWaitSecAtEntry: 60,
        expectedStaySec: 1080,
        hardExpirySec: 2100,
        method: 'geofence' as const,
        geofence: 'inside' as const,
        endReason: 'manual' as const,
      };

      await repo.archive(checkIn1);
      // Batch archive
      await repo.archiveMany([checkIn1, checkIn2]); // Idempotent on sess-1

      const found = await repo.findBySessionId('sess-1');
      expect(found?.userId).toBe('u1');

      const mealList = await repo.listForMeal('20261017-lunch');
      expect(mealList).toHaveLength(2);
    });
  });

  describe('MongoSnapshotRepository', () => {
    const repo = new MongoSnapshotRepository();

    it('saves snapshots and queries history range', async () => {
      await repo.save({
        messId: 'mess-alpha',
        mealId: '20261017-lunch',
        ts: 1_000_000,
        cameraCount: 40,
        sessionEstimate: 42,
        decayWeighted: 38,
        estWaitMin: 0,
      });

      await repo.save({
        messId: 'mess-alpha',
        mealId: '20261017-lunch',
        ts: 1_030_000,
        cameraCount: 50,
        sessionEstimate: 52,
        decayWeighted: 48,
        estWaitMin: 2,
      });

      const latest = await repo.getLatest('mess-alpha');
      expect(latest?.ts).toBe(1_030_000);
      expect(latest?.cameraCount).toBe(50);

      const history = await repo.queryHistory('mess-alpha', 999_000, 1_050_000);
      expect(history).toHaveLength(2);
    });
  });

  describe('MongoAlertRepository', () => {
    const repo = new MongoAlertRepository();

    it('creates, finds open, acknowledges, and clears alert', async () => {
      const alert = await repo.create({
        messId: 'mess-alpha',
        mealId: '20261017-lunch',
        ruleId: 'tray-depletion',
        severity: 'warning',
        payload: { projected: 350, capacity: 400 },
        raisedAt: 1_000_000,
      });

      expect(alert.id).toBeDefined();

      const openAlert = await repo.findOpen('mess-alpha', '20261017-lunch', 'tray-depletion');
      expect(openAlert?.id).toBe(alert.id);

      const acked = await repo.ack(alert.id as string, 'staff-user-1', 1_000_100);
      expect(acked?.ackedBy).toBe('staff-user-1');
      expect(acked?.ackedAt).toBe(1_000_100);

      const cleared = await repo.clear(alert.id as string, 1_000_500);
      expect(cleared?.clearedAt).toBe(1_000_500);

      const openAfterClear = await repo.findOpen('mess-alpha', '20261017-lunch', 'tray-depletion');
      expect(openAfterClear).toBeNull();
    });
  });
});
