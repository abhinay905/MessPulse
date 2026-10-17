/**
 * infra/mongo/phase2-repositories.test.ts — Integration tests for Phase 2 MongoDB repositories.
 * DOC4 Step 16 Done When: every new repository has an integration test.
 * Runs against MongoDB service container. Verifies plain typed objects and unique index constraints.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, disconnectMongo } from './connection';

import { OptOutModel } from './models/opt-out.model';
import { RatingModel } from './models/rating.model';
import { ComplaintModel } from './models/complaint.model';
import { HygieneReportModel } from './models/hygiene-report.model';
import { TrayHoldModel } from './models/tray-hold.model';
import { WasteLedgerModel } from './models/waste-ledger.model';
import { MealSummaryModel } from './models/meal-summary.model';
import { TimetableBreakModel } from './models/timetable-break.model';
import { DishStatModel } from './models/dish-stat.model';
import { RebateLedgerModel } from './models/rebate-ledger.model';
import { FastPassModel } from './models/fast-pass.model';
import { PushSubscriptionModel } from './models/push-subscription.model';
import { DeviceSightingModel } from './models/device-sighting.model';
import { AuditEventModel } from './models/audit-event.model';

import { MongoOptOutRepository } from './opt-out.repository';
import { MongoRatingRepository } from './rating.repository';
import { MongoComplaintRepository } from './complaint.repository';
import { MongoHygieneReportRepository } from './hygiene-report.repository';
import { MongoTrayHoldRepository } from './tray-hold.repository';
import { MongoWasteLedgerRepository } from './waste-ledger.repository';
import { MongoMealSummaryRepository } from './meal-summary.repository';
import { MongoTimetableBreakRepository } from './timetable-break.repository';
import { MongoDishStatRepository } from './dish-stat.repository';
import { MongoRebateLedgerRepository } from './rebate-ledger.repository';
import { MongoFastPassRepository } from './fast-pass.repository';
import { MongoPushSubscriptionRepository } from './push-subscription.repository';
import { MongoDeviceSightingRepository } from './device-sighting.repository';
import { MongoAuditEventRepository } from './audit-event.repository';

describe('Phase 2 MongoDB Repositories Integration Suite', () => {
  beforeAll(async () => {
    await connectMongo();
    // Ensure all indexes are synced
    await Promise.all([
      OptOutModel.syncIndexes(),
      RatingModel.syncIndexes(),
      ComplaintModel.syncIndexes(),
      HygieneReportModel.syncIndexes(),
      TrayHoldModel.syncIndexes(),
      WasteLedgerModel.syncIndexes(),
      MealSummaryModel.syncIndexes(),
      TimetableBreakModel.syncIndexes(),
      DishStatModel.syncIndexes(),
      RebateLedgerModel.syncIndexes(),
      FastPassModel.syncIndexes(),
      PushSubscriptionModel.syncIndexes(),
      DeviceSightingModel.syncIndexes(),
      AuditEventModel.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  beforeEach(async () => {
    await Promise.all([
      OptOutModel.deleteMany({}),
      RatingModel.deleteMany({}),
      ComplaintModel.deleteMany({}),
      HygieneReportModel.deleteMany({}),
      TrayHoldModel.deleteMany({}),
      WasteLedgerModel.deleteMany({}),
      MealSummaryModel.deleteMany({}),
      TimetableBreakModel.deleteMany({}),
      DishStatModel.deleteMany({}),
      RebateLedgerModel.deleteMany({}),
      FastPassModel.deleteMany({}),
      PushSubscriptionModel.deleteMany({}),
      DeviceSightingModel.deleteMany({}),
      AuditEventModel.deleteMany({}),
    ]);
  });

  // 1. OptOut
  describe('MongoOptOutRepository', () => {
    const repo = new MongoOptOutRepository();

    it('upserts, finds, counts, and deletes opt-outs', async () => {
      const entity = await repo.upsert('u1', 'm1');
      expect(entity.id).toBeDefined();
      expect(entity.userId).toBe('u1');
      expect(entity.mealId).toBe('m1');
      expect((entity as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      // Idempotent upsert
      await repo.upsert('u1', 'm1');
      expect(await repo.countByMeal('m1')).toBe(1);

      const found = await repo.findByUserMeal('u1', 'm1');
      expect(found?.userId).toBe('u1');

      const removed = await repo.remove('u1', 'm1');
      expect(removed).toBe(true);
      expect(await repo.countByMeal('m1')).toBe(0);
    });
  });

  // 2. Rating
  describe('MongoRatingRepository', () => {
    const repo = new MongoRatingRepository();

    it('saves rating and enforces unique sessionId', async () => {
      const r = await repo.save({
        sessionId: 's-100',
        userId: 'u1',
        mealId: 'm1',
        stars: 4,
        dishVotes: [{ dish: 'Paneer Butter Masala', vote: 'up' }],
        comment: 'Great dinner',
      });
      expect(r.id).toBeDefined();
      expect(r.stars).toBe(4);
      expect((r as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const bySession = await repo.findBySessionId('s-100');
      expect(bySession?.comment).toBe('Great dinner');

      const mealList = await repo.listForMeal('m1');
      expect(mealList).toHaveLength(1);

      const userList = await repo.listByUser('u1');
      expect(userList).toHaveLength(1);

      // Unique sessionId duplicate error
      await expect(
        repo.save({
          sessionId: 's-100',
          userId: 'u2',
          mealId: 'm1',
          stars: 5,
        })
      ).rejects.toThrow();
    });
  });

  // 3. Complaint
  describe('MongoComplaintRepository', () => {
    const repo = new MongoComplaintRepository();

    it('saves complaint, queries duplicates, counts by category, and enforces unique (sessionId, category)', async () => {
      const c = await repo.save({
        sessionId: 's-100',
        userId: 'u1',
        mealId: 'm1',
        tier: 1,
        category: 'cold_food',
        note: 'Soup is cold',
      });
      expect(c.id).toBeDefined();
      expect(c.category).toBe('cold_food');
      expect((c as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const dup = await repo.findDuplicate('s-100', 'cold_food');
      expect(dup).not.toBeNull();
      expect(dup?.sessionId).toBe('s-100');

      const count = await repo.countByMealCategory('m1', 'cold_food', Date.now() - 60000);
      expect(count).toBe(1);

      const list = await repo.listForMeal('m1');
      expect(list).toHaveLength(1);

      // Duplicate (sessionId, category) throws
      await expect(
        repo.save({
          sessionId: 's-100',
          userId: 'u1',
          mealId: 'm1',
          tier: 1,
          category: 'cold_food',
        })
      ).rejects.toThrow();
    });
  });

  // 4. HygieneReport
  describe('MongoHygieneReportRepository', () => {
    const repo = new MongoHygieneReportRepository();

    it('saves hygiene report, resolves it, and counts daily submissions', async () => {
      const rep = await repo.save({
        sessionId: 's-1',
        userId: 'u1',
        mealId: 'm1',
        kind: 'foreign_object',
        imageKey: 'img_123.jpg',
        note: 'Stapler pin found',
        status: 'open',
      });
      expect(rep.id).toBeDefined();
      expect(rep.status).toBe('open');
      expect((rep as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const openList = await repo.list({ status: 'open' });
      expect(openList).toHaveLength(1);

      const resolved = await repo.resolve(rep.id as string, 'admin-1', 'Counter inspected and cleared');
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolvedBy).toBe('admin-1');

      const countToday = await repo.countTodayByUser('u1', Date.now());
      expect(countToday).toBe(1);
    });
  });

  // 5. TrayHold
  describe('MongoTrayHoldRepository', () => {
    const repo = new MongoTrayHoldRepository();

    it('saves tray hold, releases it, and queries active by reportId', async () => {
      const hold = await repo.save({
        mealId: 'm1',
        counterId: 'regular',
        dish: 'Paneer Butter Masala',
        reportId: 'rep-1',
        status: 'held',
      });
      expect(hold.id).toBeDefined();
      expect(hold.status).toBe('held');
      expect((hold as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const active = await repo.findActiveByReportId('rep-1');
      expect(active?.id).toBe(hold.id);

      const released = await repo.release(hold.id as string, 'staff-1', Date.now());
      expect(released?.status).toBe('released');
      expect(released?.releasedBy).toBe('staff-1');

      const activeAfter = await repo.findActiveByReportId('rep-1');
      expect(activeAfter).toBeNull();
    });
  });

  // 6. WasteLedger
  describe('MongoWasteLedgerRepository', () => {
    const repo = new MongoWasteLedgerRepository();

    it('saves and finds waste ledger by mealId (unique mealId)', async () => {
      const entry = await repo.save({
        mealId: 'm-20261017-lunch',
        cookedPortions: 300,
        leftoverPortions: 25,
        advisorUsed: true,
        recordedBy: 'staff-lead',
      });
      expect(entry.id).toBeDefined();
      expect(entry.cookedPortions).toBe(300);
      expect((entry as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      // Upsert update
      const updated = await repo.save({
        mealId: 'm-20261017-lunch',
        cookedPortions: 320,
        leftoverPortions: 20,
        advisorUsed: true,
        recordedBy: 'staff-lead',
      });
      expect(updated.cookedPortions).toBe(320);

      const fetched = await repo.findByMealId('m-20261017-lunch');
      expect(fetched?.cookedPortions).toBe(320);

      const recent = await repo.listRecent(5);
      expect(recent).toHaveLength(1);
    });
  });

  // 7. MealSummary
  describe('MongoMealSummaryRepository', () => {
    const repo = new MongoMealSummaryRepository();

    it('saves meal summary and retrieves history for same meal type and day of week', async () => {
      const summary = await repo.save({
        messId: 'mess-1',
        mealId: 'm-summary-1',
        type: 'lunch',
        dayOfWeek: 1,
        totalEntries: 250,
        peakOccupancy: 140,
        optOutCount: 30,
        enrolledCount: 500,
        appCheckIns: 180,
        adoptionRatio: 0.72,
      });
      expect(summary.id).toBeDefined();
      expect(summary.adoptionRatio).toBe(0.72);
      expect((summary as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const found = await repo.findByMealId('m-summary-1');
      expect(found?.totalEntries).toBe(250);

      const history = await repo.listHistory('mess-1', 'lunch', 1, 10);
      expect(history).toHaveLength(1);
      expect(history[0]?.mealId).toBe('m-summary-1');
    });
  });

  // 8. TimetableBreak
  describe('MongoTimetableBreakRepository', () => {
    const repo = new MongoTimetableBreakRepository();

    it('replaces timetable breaks for mess and lists them', async () => {
      const breaks = await repo.replaceForMess('mess-1', [
        { messId: 'mess-1', dayOfWeek: 1, startsAt: '12:45', endsAt: '13:00', label: 'CS Break' },
        { messId: 'mess-1', dayOfWeek: 1, startsAt: '13:15', endsAt: '13:30', label: 'Mech Break' },
      ]);
      expect(breaks).toHaveLength(2);
      expect((breaks[0] as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const list = await repo.listForMess('mess-1');
      expect(list).toHaveLength(2);
      expect(list[0]?.label).toBe('CS Break');
    });
  });

  // 9. DishStat
  describe('MongoDishStatRepository', () => {
    const repo = new MongoDishStatRepository();

    it('upserts, increments ratings, updates DPS, and lists leaderboard', async () => {
      const stat = await repo.upsert({
        messId: 'mess-1',
        dish: 'Paneer Butter Masala',
        mealType: 'lunch',
        timesServed: 5,
        ratingSum: 20,
        ratingCount: 5,
        upVotes: 4,
        downVotes: 1,
        skipDeviationSum: 0,
        dps: 80,
      });
      expect(stat.id).toBeDefined();
      expect(stat.dps).toBe(80);
      expect((stat as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      await repo.incrementRating('mess-1', 'Paneer Butter Masala', 'lunch', 5, true, false);
      const fetched = await repo.findByDish('mess-1', 'Paneer Butter Masala', 'lunch');
      expect(fetched?.ratingCount).toBe(6);
      expect(fetched?.ratingSum).toBe(25);
      expect(fetched?.upVotes).toBe(5);

      await repo.updateDps('mess-1', 'Paneer Butter Masala', 'lunch', 85, 2);
      const updated = await repo.findByDish('mess-1', 'Paneer Butter Masala', 'lunch');
      expect(updated?.dps).toBe(85);
      expect(updated?.skipDeviationSum).toBe(2);

      const leaderboard = await repo.listLeaderboard('mess-1');
      expect(leaderboard).toHaveLength(1);
    });
  });

  // 10. RebateLedger
  describe('MongoRebateLedgerRepository', () => {
    const repo = new MongoRebateLedgerRepository();

    it('saves points, calculates balance, lists history, and enforces unique (userId, mealId, reason)', async () => {
      await repo.save({
        userId: 'u1',
        mealId: 'm1',
        points: 5,
        reason: 'opt_out_honoured',
      });
      await repo.save({
        userId: 'u1',
        mealId: 'm2',
        points: -20,
        reason: 'redeem_pass',
      });

      const balance = await repo.getBalance('u1');
      expect(balance).toBe(-15);

      const history = await repo.getHistory('u1');
      expect(history).toHaveLength(2);

      // Duplicate (userId, mealId, reason) throws
      await expect(
        repo.save({
          userId: 'u1',
          mealId: 'm1',
          points: 5,
          reason: 'opt_out_honoured',
        })
      ).rejects.toThrow();
    });
  });

  // 11. FastPass
  describe('MongoFastPassRepository', () => {
    const repo = new MongoFastPassRepository();

    it('saves pass, marks used, queries by code, and enforces unique (userId, mealId)', async () => {
      const pass = await repo.save({
        userId: 'u1',
        mealId: 'm1',
        code: 'A1B2',
        status: 'issued',
      });
      expect(pass.id).toBeDefined();
      expect(pass.code).toBe('A1B2');
      expect((pass as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const byCode = await repo.findByCode('a1b2');
      expect(byCode?.userId).toBe('u1');

      const byUserMeal = await repo.findByUserMeal('u1', 'm1');
      expect(byUserMeal?.code).toBe('A1B2');

      const used = await repo.markUsed('A1B2', 'staff-1', Date.now());
      expect(used?.status).toBe('used');
      expect(used?.usedBy).toBe('staff-1');

      // Second markUsed returns null because status is already 'used'
      const secondUsed = await repo.markUsed('A1B2', 'staff-1', Date.now());
      expect(secondUsed).toBeNull();

      expect(await repo.countForMeal('m1')).toBe(1);

      // Duplicate (userId, mealId) throws
      await expect(
        repo.save({
          userId: 'u1',
          mealId: 'm1',
          code: 'C3D4',
          status: 'issued',
        })
      ).rejects.toThrow();
    });
  });

  // 12. PushSubscription
  describe('MongoPushSubscriptionRepository', () => {
    const repo = new MongoPushSubscriptionRepository();

    it('saves subscription, finds by endpoint, and deletes by endpoint/user', async () => {
      const sub = await repo.save({
        userId: 'u1',
        endpoint: 'https://push.example.com/sub/123',
        keys: { p256dh: 'key-p256', auth: 'key-auth' },
        userAgent: 'Mozilla/5.0 Android',
      });
      expect(sub.id).toBeDefined();
      expect((sub as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const byEndpoint = await repo.findByEndpoint('https://push.example.com/sub/123');
      expect(byEndpoint?.userId).toBe('u1');

      const userSubs = await repo.listByUser('u1');
      expect(userSubs).toHaveLength(1);

      const deleted = await repo.deleteByEndpoint('https://push.example.com/sub/123');
      expect(deleted).toBe(true);

      const afterDel = await repo.findByEndpoint('https://push.example.com/sub/123');
      expect(afterDel).toBeNull();
    });
  });

  // 13. DeviceSighting
  describe('MongoDeviceSightingRepository', () => {
    const repo = new MongoDeviceSightingRepository();

    it('records device sightings, updates lastSeenAt, and queries by device/user', async () => {
      const now = Date.now();
      const s1 = await repo.record('dev-1', 'u1', now);
      expect(s1.firstSeenAt).toBe(now);
      expect(s1.lastSeenAt).toBe(now);
      expect((s1 as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const later = now + 5000;
      const s2 = await repo.record('dev-1', 'u1', later);
      expect(s2.firstSeenAt).toBe(now);
      expect(s2.lastSeenAt).toBe(later);

      const deviceList = await repo.listForDevice('dev-1', now - 1000);
      expect(deviceList).toHaveLength(1);

      const userList = await repo.listForUser('u1', now - 1000);
      expect(userList).toHaveLength(1);
    });
  });

  // 14. AuditEvent
  describe('MongoAuditEventRepository', () => {
    const repo = new MongoAuditEventRepository();

    it('saves audit events, acks them, and lists for meal', async () => {
      const event = await repo.save({
        mealId: 'm1',
        kind: 'random_audit',
        raisedAt: Date.now(),
      });
      expect(event.id).toBeDefined();
      expect(event.kind).toBe('random_audit');
      expect((event as unknown as Record<string, unknown>).$isNew).toBeUndefined();

      const list = await repo.listForMeal('m1');
      expect(list).toHaveLength(1);

      const acked = await repo.ack(event.id as string, Date.now(), 'checked');
      expect(acked?.outcome).toBe('checked');
      expect(acked?.ackedAt).toBeDefined();
    });
  });
});
