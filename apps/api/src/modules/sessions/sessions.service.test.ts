/**
 * modules/sessions/sessions.service.test.ts — Unit and service tests for SessionService.
 * DOC3 §3.4, DOC4 Step 9.
 *
 * Verifies:
 * - checkIn with valid token -> 201 SessionDTO
 * - duplicate check-in -> 409 ALREADY_CHECKED_IN
 * - invalid/expired token -> 422 MEAL_TOKEN_INVALID
 * - meal not open -> 409 NO_ACTIVE_MEAL
 * - geofence tri-state and zero lat/lng persistence
 * - endEarly idempotency and manual archive
 * - Fake-clock decay test (weight 1.0 -> 0.60 -> 0.25 -> archived as expired)
 * - Occupancy snapshot reflects live activeSessions & decayWeightedSessions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionService } from './sessions.service';
import { signMealToken } from './meal-token';
import { InMemorySessionStore } from '../../infra/memory/session-store.memory';
import { InMemoryCameraReadingStore } from '../../infra/memory/camera-reading-store.memory';
import { EventBus } from '../../infra/event-bus';
import { ConflictError, ValidationError } from '../../shared-kernel/errors';
import { sessionWeight } from '../../core/decay';
import { OccupancyService } from '../occupancy/occupancy.service';
import type {
  CheckInEntity,
  CheckInRepository,
  Clock,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  SettingsRepository,
  SnapshotRepository,
  OccupancySnapshotEntity,
} from '../../core/ports';

class TestClock implements Clock {
  constructor(public currentTime: number) {}
  now(): number {
    return this.currentTime;
  }
  advance(ms: number): void {
    this.currentTime += ms;
  }
}

class InMemoryCheckInRepo implements CheckInRepository {
  public archives: CheckInEntity[] = [];

  async archive(checkIn: Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.archives.push({
      ...checkIn,
      id: `arch-${this.archives.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async archiveMany(checkIns: Array<Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    for (const c of checkIns) {
      await this.archive(c);
    }
  }

  async findBySessionId(sessionId: string): Promise<CheckInEntity | null> {
    return this.archives.find((a) => a.sessionId === sessionId) ?? null;
  }

  async listForMeal(mealId: string): Promise<CheckInEntity[]> {
    return this.archives.filter((a) => a.mealId === mealId);
  }
}

class InMemoryMealRepo implements MealRepository {
  public meals = new Map<string, MealEntity>();

  async findByMealId(messId: string, mealId: string): Promise<MealEntity | null> {
    return this.meals.get(`${messId}:${mealId}`) ?? null;
  }

  async findActiveAt(messId: string, now: number): Promise<MealEntity | null> {
    for (const meal of this.meals.values()) {
      if (meal.messId === messId && now >= meal.startsAt && now <= meal.endsAt) {
        return meal;
      }
    }
    return null;
  }

  async findActiveOrUpcoming(messId: string, now: number, bufferMs = 0): Promise<MealEntity | null> {
    for (const meal of this.meals.values()) {
      if (meal.messId === messId && now >= meal.startsAt && now <= meal.endsAt + bufferMs) {
        return meal;
      }
    }
    return null;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    const entity: MealEntity = {
      ...meal,
      id: `meal-${this.meals.size + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.meals.set(`${meal.messId}:${meal.mealId}`, entity);
    return entity;
  }

  async updateTrayCapacity(messId: string, mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    const key = `${messId}:${mealId}`;
    const meal = this.meals.get(key);
    if (!meal) return null;
    meal.trayCapacity = trayCapacity;
    return meal;
  }
}

class InMemorySettingsRepo implements SettingsRepository {
  public settings = new Map<string, MessSettingsEntity>();

  async getByMessId(messId: string): Promise<MessSettingsEntity | null> {
    return this.settings.get(messId) ?? null;
  }

  async upsert(s: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    const entity: MessSettingsEntity = {
      ...s,
      id: `set-${this.settings.size + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.settings.set(s.messId, entity);
    return entity;
  }
}

class InMemorySnapshotRepo implements SnapshotRepository {
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
    const filtered = this.snapshots.filter((s) => s.messId === messId);
    const last = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
    return last ?? null;
  }
}

describe('SessionService', () => {
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';
  const messId = 'mess-main-hall';
  const mealId = '20261017-lunch';

  let clock: TestClock;
  let eventBus: EventBus;
  let sessionStore: InMemorySessionStore;
  let checkInRepo: InMemoryCheckInRepo;
  let mealRepo: InMemoryMealRepo;
  let settingsRepo: InMemorySettingsRepo;
  let cameraStore: InMemoryCameraReadingStore;
  let snapshotRepo: InMemorySnapshotRepo;
  let occupancyService: OccupancyService;
  let sessionService: SessionService;

  const t0 = new Date('2026-10-17T12:00:00Z').getTime();

  beforeEach(async () => {
    clock = new TestClock(t0);
    eventBus = new EventBus();
    sessionStore = new InMemorySessionStore();
    checkInRepo = new InMemoryCheckInRepo();
    mealRepo = new InMemoryMealRepo();
    settingsRepo = new InMemorySettingsRepo();
    cameraStore = new InMemoryCameraReadingStore();
    snapshotRepo = new InMemorySnapshotRepo();

    await settingsRepo.upsert({
      messId,
      name: 'Main Dining Hall',
      seatCapacity: 200,
      servicePerMin: 12,
      baseMealMin: 18,
      maxSessionMin: 60,
      decay: {
        tail: [
          { untilOffsetMin: 8, weight: 0.6 },
          { untilOffsetMin: 17, weight: 0.25 },
        ],
      },
      staleCameraSec: 30,
      alertThresholds: {},
      geofence: {
        lat: 12.9716,
        lng: 77.5946,
        radiusM: 100,
      },
    });

    await mealRepo.upsert({
      messId,
      mealId,
      type: 'lunch',
      startsAt: t0,
      endsAt: t0 + 2.5 * 3600 * 1000, // 2.5 hours
      menuItems: ['Rice', 'Dal', 'Paneer'],
      menuDemandFactorMin: 0,
      trayCapacity: 300,
    });

    occupancyService = new OccupancyService(
      cameraStore,
      sessionStore,
      mealRepo,
      settingsRepo,
      snapshotRepo,
      eventBus,
      messId
    );

    sessionService = new SessionService(
      sessionStore,
      checkInRepo,
      mealRepo,
      settingsRepo,
      occupancyService,
      eventBus,
      clock,
      jwtSecret,
      messId
    );
  });

  it('checks in a student with a valid meal token and returns 201 SessionDTO', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);
    const session = await sessionService.checkIn('user-student-1', {
      mealToken,
      geo: { lat: 12.9716, lng: 77.5946, accuracy: 15 },
    });

    expect(session.sessionId).toBeDefined();
    expect(session.mealId).toBe(mealId);
    expect(session.checkedInAt).toBe(t0);
    expect(session.geofence).toBe('inside');
    // expectedStay = 18 min = 1080 s
    expect(session.expectedStayEndsAt).toBe(t0 + 18 * 60 * 1000);
    // hardExpiry = expectedStay + 17 min = 35 min = 2100 s
    expect(session.hardExpiresAt).toBe(t0 + 35 * 60 * 1000);
  });

  it('throws 409 ALREADY_CHECKED_IN on duplicate check-in by the same user', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    await sessionService.checkIn('user-student-1', { mealToken });

    await expect(
      sessionService.checkIn('user-student-1', { mealToken })
    ).rejects.toThrowError(ConflictError);

    try {
      await sessionService.checkIn('user-student-1', { mealToken });
    } catch (err) {
      const conflictErr = err as ConflictError;
      expect(conflictErr.httpStatus).toBe(409);
      expect(conflictErr.code).toBe('ALREADY_CHECKED_IN');
    }
  });

  it('throws 422 MEAL_TOKEN_INVALID on expired token', async () => {
    const expiredToken = signMealToken({ messId, mealId }, jwtSecret, -10);

    await expect(
      sessionService.checkIn('user-student-1', { mealToken: expiredToken })
    ).rejects.toThrowError(ValidationError);

    try {
      await sessionService.checkIn('user-student-1', { mealToken: expiredToken });
    } catch (err) {
      const valErr = err as ValidationError;
      expect(valErr.httpStatus).toBe(422);
      expect(valErr.code).toBe('MEAL_TOKEN_INVALID');
    }
  });

  it('throws 409 NO_ACTIVE_MEAL when checking in before meal start', async () => {
    clock.currentTime = t0 - 1000; // 1 second before start
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    await expect(
      sessionService.checkIn('user-student-1', { mealToken })
    ).rejects.toThrowError(ConflictError);

    try {
      await sessionService.checkIn('user-student-1', { mealToken });
    } catch (err) {
      const conflictErr = err as ConflictError;
      expect(conflictErr.httpStatus).toBe(409);
      expect(conflictErr.code).toBe('NO_ACTIVE_MEAL');
    }
  });

  it('evaluates geofence tri-state and never stores raw lat/lng', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    // 1. Inside
    const s1 = await sessionService.checkIn('user-1', {
      mealToken,
      geo: { lat: 12.9716, lng: 77.5946, accuracy: 20 },
    });
    expect(s1.geofence).toBe('inside');

    // 2. Outside (> 100m away)
    const s2 = await sessionService.checkIn('user-2', {
      mealToken,
      geo: { lat: 13.0, lng: 77.6, accuracy: 20 },
    });
    expect(s2.geofence).toBe('outside');

    // 3. Poor accuracy (> 150m) -> 'unknown'
    const s3 = await sessionService.checkIn('user-3', {
      mealToken,
      geo: { lat: 12.9716, lng: 77.5946, accuracy: 200 },
    });
    expect(s3.geofence).toBe('unknown');

    // 4. Missing geo -> 'unknown'
    const s4 = await sessionService.checkIn('user-4', { mealToken });
    expect(s4.geofence).toBe('unknown');

    // Verify stored active sessions have NO lat or lng fields
    const stored = await sessionStore.listActive(mealId, clock.now());
    for (const session of stored) {
      expect((session as unknown as Record<string, unknown>).lat).toBeUndefined();
      expect((session as unknown as Record<string, unknown>).lng).toBeUndefined();
    }
  });

  it('retrieves active session for student and returns null when not active', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    expect(await sessionService.getActiveSession('user-student-1')).toBeNull();

    await sessionService.checkIn('user-student-1', { mealToken });

    const active = await sessionService.getActiveSession('user-student-1');
    expect(active).not.toBeNull();
    expect(active?.mealId).toBe(mealId);
  });

  it('ends session early with endReason: manual and is idempotent', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);
    await sessionService.checkIn('user-student-1', { mealToken });

    // End early
    clock.advance(5 * 60 * 1000); // 5 min in
    await sessionService.endEarly('user-student-1');

    // Active session is gone
    expect(await sessionService.getActiveSession('user-student-1')).toBeNull();

    // Mongo check-in archive created with manual reason
    expect(checkInRepo.archives).toHaveLength(1);
    expect(checkInRepo.archives[0]?.endReason).toBe('manual');
    expect(checkInRepo.archives[0]?.endedAt).toBe(t0 + 5 * 60 * 1000);

    // Idempotent: second call does not throw or duplicate archive
    await expect(sessionService.endEarly('user-student-1')).resolves.not.toThrow();
    expect(checkInRepo.archives).toHaveLength(1);
  });

  it('demonstrates probabilistic decay: weight 1.0 -> 0.60 -> 0.25 -> archived as expired', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 7200);
    const session = await sessionService.checkIn('user-student-decay', { mealToken });

    const decaySettings = {
      tail: [
        { untilOffsetMin: 8, weight: 0.6 },
        { untilOffsetMin: 17, weight: 0.25 },
      ],
    };

    const sessionData = {
      checkedInAt: session.checkedInAt,
      expectedStaySec: 18 * 60,
      hardExpirySec: 35 * 60,
    };

    // 1. At t0 + 10 min (elapsed < expectedStay 18 min): weight = 1.0
    clock.advance(10 * 60 * 1000);
    expect(sessionWeight(sessionData, clock.now(), decaySettings)).toBe(1.0);

    // Status snapshot reflects weight 1.0
    let snapshot = await occupancyService.tick(clock.now());
    expect(snapshot.activeSessions).toBe(1);
    expect(snapshot.decayWeightedSessions).toBe(1);

    // 2. At t0 + 20 min (elapsed 20 min, offset 2 min into tail, < 8 min): weight = 0.60
    clock.advance(10 * 60 * 1000); // now t0 + 20 min
    expect(sessionWeight(sessionData, clock.now(), decaySettings)).toBe(0.6);

    snapshot = await occupancyService.tick(clock.now());
    expect(snapshot.activeSessions).toBe(1);
    expect(snapshot.decayWeightedSessions).toBe(0.6);

    // 3. At t0 + 30 min (elapsed 30 min, offset 12 min into tail, 8..17 min): weight = 0.25
    clock.advance(10 * 60 * 1000); // now t0 + 30 min
    expect(sessionWeight(sessionData, clock.now(), decaySettings)).toBe(0.25);

    snapshot = await occupancyService.tick(clock.now());
    expect(snapshot.activeSessions).toBe(1);
    expect(snapshot.decayWeightedSessions).toBe(0.25);

    // 4. At t0 + 36 min (elapsed 36 min > hardExpiry 35 min): weight = 0
    clock.advance(6 * 60 * 1000); // now t0 + 36 min
    expect(sessionWeight(sessionData, clock.now(), decaySettings)).toBe(0);

    // Reaper runs and reaps the expired session
    const reapedCount = await sessionService.reapExpired(mealId, clock.now());
    expect(reapedCount).toBe(1);

    // Archived to Mongo as 'expired'
    expect(checkInRepo.archives).toHaveLength(1);
    expect(checkInRepo.archives[0]?.endReason).toBe('expired');
    expect(checkInRepo.archives[0]?.sessionId).toBe(session.sessionId);

    // Status snapshot now reflects 0 active sessions
    snapshot = await occupancyService.tick(clock.now());
    expect(snapshot.activeSessions).toBe(0);
    expect(snapshot.decayWeightedSessions).toBe(0);
  });
});
