/**
 * modules/admin/admin.service.test.ts — Unit tests for AdminService.
 * DOC3 §3.7, DOC4 Step 14.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdminService } from './admin.service';
import type {
  SnapshotRepository,
  SettingsRepository,
  MealRepository,
  SessionStore,
  OccupancySnapshotEntity,
  MessSettingsEntity,
  MealEntity,
  ActiveSession,
  Clock,
} from './admin.ports';
import { EventBus } from '../../infra/event-bus';
import { ValidationError, ConflictError, NotFoundError } from '../../shared-kernel/errors';
import { verifyMealToken } from '../sessions/meal-token';

class FakeSnapshotRepository implements SnapshotRepository {
  public snapshots: OccupancySnapshotEntity[] = [];

  async save(snapshot: Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.snapshots.push({
      ...snapshot,
      id: `snap-${this.snapshots.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async queryHistory(messId: string, fromTs: number, toTs: number): Promise<OccupancySnapshotEntity[]> {
    return this.snapshots.filter((s) => s.messId === messId && s.ts >= fromTs && s.ts <= toTs);
  }

  async getLatest(messId: string): Promise<OccupancySnapshotEntity | null> {
    const list = this.snapshots.filter((s) => s.messId === messId);
    return list.length > 0 ? list[list.length - 1] ?? null : null;
  }
}

class FakeSettingsRepository implements SettingsRepository {
  public settings = new Map<string, MessSettingsEntity>();

  async getByMessId(messId: string): Promise<MessSettingsEntity | null> {
    return this.settings.get(messId) ?? null;
  }

  async upsert(s: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    const entity: MessSettingsEntity = {
      ...s,
      id: `settings-1`,
      createdAt: new Date(),
      updatedAt: new Date(1700000050000),
    };
    this.settings.set(s.messId, entity);
    return entity;
  }
}

class FakeMealRepository implements MealRepository {
  public meals: MealEntity[] = [];

  async findByMealId(_messId: string, mealId: string): Promise<MealEntity | null> {
    void _messId;
    return this.meals.find((m) => m.mealId === mealId) ?? null;
  }

  async findActiveAt(messId: string, now: number): Promise<MealEntity | null> {
    return this.meals.find((m) => m.messId === messId && m.startsAt <= now && m.endsAt >= now) ?? null;
  }

  async findActiveOrUpcoming(messId: string, now: number): Promise<MealEntity | null> {
    void messId;
    void now;
    return this.meals[0] ?? null;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    const entity: MealEntity = {
      ...meal,
      id: `meal-1`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.meals.push(entity);
    return entity;
  }

  async updateTrayCapacity(_messId: string, _mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    void _messId;
    void _mealId;
    void trayCapacity;
    return null;
  }
}

class FakeSessionStore implements SessionStore {
  public sessions: ActiveSession[] = [];

  async start(session: ActiveSession): Promise<'created' | 'already_active'> {
    this.sessions.push(session);
    return 'created';
  }

  async getActiveForUser(userId: string, mealId: string): Promise<ActiveSession | null> {
    return this.sessions.find((s) => s.userId === userId && s.mealId === mealId) ?? null;
  }

  async end(userId: string, mealId: string): Promise<ActiveSession | null> {
    const idx = this.sessions.findIndex((s) => s.userId === userId && s.mealId === mealId);
    if (idx === -1) return null;
    return this.sessions.splice(idx, 1)[0] ?? null;
  }

  async listActive(mealId: string, _now: number): Promise<ActiveSession[]> {
    void _now;
    return this.sessions.filter((s) => s.mealId === mealId);
  }

  async removeExpired(mealId: string, now: number): Promise<ActiveSession[]> {
    const remaining: ActiveSession[] = [];
    const expired: ActiveSession[] = [];
    for (const s of this.sessions) {
      if (s.mealId === mealId && s.hardExpiresAt <= now) {
        expired.push(s);
      } else {
        remaining.push(s);
      }
    }
    this.sessions = remaining;
    return expired;
  }
}

class FakeClock implements Clock {
  constructor(public current: number) {}
  now(): number {
    return this.current;
  }
}

describe('AdminService', () => {
  let snapshotRepo: FakeSnapshotRepository;
  let settingsRepo: FakeSettingsRepository;
  let mealRepo: FakeMealRepository;
  let sessionStore: FakeSessionStore;
  let eventBus: EventBus;
  let clock: FakeClock;
  let service: AdminService;

  const baseNow = 1700000000000;
  const messId = 'mess-main-hall';
  const mealId = '20261017-lunch';
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';

  beforeEach(() => {
    snapshotRepo = new FakeSnapshotRepository();
    settingsRepo = new FakeSettingsRepository();
    mealRepo = new FakeMealRepository();
    sessionStore = new FakeSessionStore();
    eventBus = new EventBus();
    clock = new FakeClock(baseNow);

    settingsRepo.settings.set(messId, {
      id: 'settings-1',
      messId,
      name: 'Main Dining Hall',
      seatCapacity: 200,
      servicePerMin: 12,
      geofence: { lat: 12.9716, lng: 77.5946, radiusM: 100 },
      decay: {
        tail: [
          { untilOffsetMin: 8, weight: 0.6 },
          { untilOffsetMin: 17, weight: 0.25 },
        ],
      },
      baseMealMin: 18,
      maxSessionMin: 60,
      staleCameraSec: 30,
      alertThresholds: { cooldownSec: 180, demandFactor: 2 },
      updatedAt: new Date(1700000000000),
    });

    mealRepo.meals.push({
      id: 'm-1',
      messId,
      mealId,
      type: 'lunch',
      startsAt: baseNow - 30 * 60 * 1000,
      endsAt: baseNow + 60 * 60 * 1000,
      menuItems: ['Rice', 'Dal', 'Curry'],
      menuDemandFactorMin: 0,
      trayCapacity: 300,
    });

    service = new AdminService(
      snapshotRepo,
      settingsRepo,
      mealRepo,
      sessionStore,
      eventBus,
      clock,
      jwtSecret
    );
  });

  describe('getTimeSeries', () => {
    it('returns series points directly when count <= maxPoints', async () => {
      await snapshotRepo.save({
        messId,
        mealId,
        ts: baseNow - 60000,
        cameraCount: 50,
        sessionEstimate: 45,
        decayWeighted: 40,
        estWaitMin: 3,
      });
      await snapshotRepo.save({
        messId,
        mealId,
        ts: baseNow,
        cameraCount: 65,
        sessionEstimate: 60,
        decayWeighted: 52,
        estWaitMin: 4,
      });

      const series = await service.getTimeSeries(messId, baseNow - 120000, baseNow + 1000, 100);
      expect(series).toHaveLength(2);
      expect(series[0]?.camera).toBe(50);
      expect(series[1]?.camera).toBe(65);
      expect(series[1]?.sessionEstimate).toBe(60);
    });

    it('downsamples points when snapshot count exceeds maxPoints', async () => {
      // Add 20 snapshots
      for (let i = 0; i < 20; i++) {
        await snapshotRepo.save({
          messId,
          mealId,
          ts: baseNow + i * 1000,
          cameraCount: i * 2,
          sessionEstimate: i * 2,
          decayWeighted: i * 1.5,
          estWaitMin: 2,
        });
      }

      // Max points = 5 => should downsample to 5 buckets
      const series = await service.getTimeSeries(messId, baseNow, baseNow + 30000, 5);
      expect(series.length).toBeLessThanOrEqual(5);
      expect(series[0]?.camera).toBeGreaterThanOrEqual(0);
    });

    it('throws ValidationError when range exceeds 31 days', async () => {
      const from = baseNow;
      const to = baseNow + 32 * 24 * 60 * 60 * 1000;
      await expect(service.getTimeSeries(messId, from, to)).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when from >= to', async () => {
      await expect(service.getTimeSeries(messId, baseNow, baseNow - 1000)).rejects.toThrow(ValidationError);
    });
  });

  describe('getDecayCurve', () => {
    it('evaluates theoretical decay curve and live session histogram', async () => {
      // Add active sessions with different checked-in offsets
      sessionStore.sessions.push(
        {
          sessionId: 's-1',
          userId: 'u-1',
          messId,
          mealId,
          checkedInAt: baseNow - 5 * 60 * 1000, // 5 min ago => weight 1.0 (bin 0.8-1.0)
          expectedStayEndsAt: baseNow + 13 * 60 * 1000,
          hardExpiresAt: baseNow + 30 * 60 * 1000,
          method: 'qr',
          geofence: 'inside',
        },
        {
          sessionId: 's-2',
          userId: 'u-2',
          messId,
          mealId,
          checkedInAt: baseNow - 22 * 60 * 1000, // 22 min ago => tail 0.60 (bin 0.6-0.8)
          expectedStayEndsAt: baseNow - 4 * 60 * 1000,
          hardExpiresAt: baseNow + 13 * 60 * 1000,
          method: 'qr',
          geofence: 'inside',
        }
      );

      const res = await service.getDecayCurve(messId);
      expect(res.theoretical.length).toBe(61); // 0 to 60 minutes
      expect(res.theoretical[0]?.weight).toBe(1);
      expect(res.activeSessions).toBe(2);

      const binHigh = res.liveHistogram.find((b) => b.bin === '0.8 - 1.0');
      const binMid = res.liveHistogram.find((b) => b.bin === '0.6 - 0.8');
      expect(binHigh?.count).toBe(1);
      expect(binMid?.count).toBe(1);
    });
  });

  describe('settings management', () => {
    it('returns current settings formatted as SettingsDTO', async () => {
      const settings = await service.getSettings(messId);
      expect(settings.messId).toBe(messId);
      expect(settings.capacity).toBe(200);
      expect(settings.servicePerMin).toBe(12);
      expect(settings.demandFactor).toBe(2);
      expect(settings.alertCooldownSec).toBe(180);
    });

    it('patches settings and publishes settings.changed event', async () => {
      const events: unknown[] = [];
      eventBus.subscribe('settings.changed', (e) => {
        events.push(e);
      });

      const updated = await service.updateSettings(
        messId,
        { capacity: 250, servicePerMin: 15 },
        1700000000000
      );

      expect(updated.capacity).toBe(250);
      expect(updated.servicePerMin).toBe(15);
      expect(events).toHaveLength(1);
    });

    it('rejects unknown fields with ValidationError (due to .strict())', async () => {
      await expect(
        service.updateSettings(messId, { capacity: 250, invalidField: 'hack' })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects cross-field inconsistency maxSessionMin < baseMealMin', async () => {
      await expect(
        service.updateSettings(messId, { baseMealMin: 30, maxSessionMin: 20 })
      ).rejects.toThrow(ValidationError);
    });

    it('detects optimistic concurrency conflict and throws ConflictError', async () => {
      // Expected timestamp differs from current 1700000000000
      await expect(
        service.updateSettings(messId, { capacity: 220 }, 1699999999999)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getCheckinToken', () => {
    it('generates a valid signed meal token and URL', async () => {
      const resp = await service.getCheckinToken(mealId, 'https://messpulse.college.edu');
      expect(resp.token).toBeDefined();
      expect(resp.url).toBe(`https://messpulse.college.edu/student?token=${resp.token}`);
      expect(resp.expiresAt).toBeGreaterThan(baseNow);

      const verified = verifyMealToken(resp.token, jwtSecret);
      expect(verified.messId).toBe(messId);
      expect(verified.mealId).toBe(mealId);
    });

    it('throws NotFoundError for non-existent mealId', async () => {
      await expect(service.getCheckinToken('non-existent-meal')).rejects.toThrow(NotFoundError);
    });
  });
});
