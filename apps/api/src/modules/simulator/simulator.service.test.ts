/**
 * modules/simulator/simulator.service.test.ts — Unit tests for SimulatorService.
 * DOC3 §3.9, DOC4 Step 10.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulatorService } from './simulator.service';
import { SwitchableClock } from '../../infra/clock';
import { InMemorySessionStore } from '../../infra/memory/session-store.memory';
import { InMemoryCameraReadingStore } from '../../infra/memory/camera-reading-store.memory';
import { InMemoryEntryVelocityStore } from '../../infra/memory/entry-velocity-store.memory';
import { IngestService } from '../ingest/ingest.service';
import { SessionService } from '../sessions/sessions.service';
import { OccupancyService } from '../occupancy/occupancy.service';
import { EventBus } from '../../infra/event-bus';
import { ConflictError, ForbiddenError, ValidationError } from '../../shared-kernel/errors';
import type {
  CheckInEntity,
  CheckInRepository,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  OccupancySnapshotEntity,
  SettingsRepository,
  SnapshotRepository,
} from '../../core/ports';

class TestMealRepo implements MealRepository {
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
    const meal = this.meals.get(`${messId}:${mealId}`);
    if (!meal) return null;
    meal.trayCapacity = trayCapacity;
    return meal;
  }
}

class TestSettingsRepo implements SettingsRepository {
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

class TestCheckInRepo implements CheckInRepository {
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

class TestSnapshotRepo implements SnapshotRepository {
  public snapshots: OccupancySnapshotEntity[] = [];

  async save(s: Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.snapshots.push({
      ...s,
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
    return list.length > 0 ? (list[list.length - 1] ?? null) : null;
  }
}

describe('SimulatorService', () => {
  const messId = 'mess-main-hall';
  const mealId = '20261017-lunch';
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';

  let clock: SwitchableClock;
  let eventBus: EventBus;
  let sessionStore: InMemorySessionStore;
  let cameraStore: InMemoryCameraReadingStore;
  let velocityStore: InMemoryEntryVelocityStore;
  let mealRepo: TestMealRepo;
  let settingsRepo: TestSettingsRepo;
  let checkInRepo: TestCheckInRepo;
  let snapshotRepo: TestSnapshotRepo;

  let ingestService: IngestService;
  let occupancyService: OccupancyService;
  let sessionService: SessionService;
  let simulatorService: SimulatorService;

  beforeEach(async () => {
    clock = new SwitchableClock();
    eventBus = new EventBus();
    sessionStore = new InMemorySessionStore();
    cameraStore = new InMemoryCameraReadingStore();
    velocityStore = new InMemoryEntryVelocityStore();
    mealRepo = new TestMealRepo();
    settingsRepo = new TestSettingsRepo();
    checkInRepo = new TestCheckInRepo();
    snapshotRepo = new TestSnapshotRepo();

    const now = Date.now();
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
      geofence: { lat: 12.9716, lng: 77.5946, radiusM: 100 },
    });

    await mealRepo.upsert({
      messId,
      mealId,
      type: 'lunch',
      startsAt: now - 30 * 60 * 1000,
      endsAt: now + 3 * 3600 * 1000,
      menuItems: ['Rice', 'Dal', 'Paneer'],
      menuDemandFactorMin: 1,
      trayCapacity: 300,
    });

    ingestService = new IngestService(cameraStore, velocityStore, mealRepo, eventBus);
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

    simulatorService = new SimulatorService({
      clock,
      ingestService,
      sessionService,
      sessionStore,
      mealRepo,
      allowSimulator: true,
      defaultMessId: messId,
    });
  });

  afterEach(async () => {
    await simulatorService.stop();
  });

  it('refuses to start when allowSimulator is false with 403 SIMULATOR_DISABLED', async () => {
    const disabledService = new SimulatorService({
      clock,
      ingestService,
      sessionService,
      sessionStore,
      mealRepo,
      allowSimulator: false,
      defaultMessId: messId,
    });

    await expect(disabledService.start()).rejects.toThrowError(ForbiddenError);
    try {
      await disabledService.start();
    } catch (err) {
      const forbErr = err as ForbiddenError;
      expect(forbErr.httpStatus).toBe(403);
      expect(forbErr.code).toBe('SIMULATOR_DISABLED');
    }
  });

  it('rejects invalid speed with ValidationError', async () => {
    await expect(simulatorService.start({ speed: 0 })).rejects.toThrowError(ValidationError);
    await expect(simulatorService.start({ speed: 35 })).rejects.toThrowError(ValidationError);
  });

  it('starts simulation, updates status, and throws 409 SIMULATOR_RUNNING if already active', async () => {
    const { runId } = await simulatorService.start({ speed: 10, peakPeople: 100, durationMin: 10 });
    expect(runId).toBeDefined();

    const status = simulatorService.status();
    expect(status.running).toBe(true);
    expect(status.runId).toBe(runId);
    expect(status.speed).toBe(10);

    // Conflict on second start
    await expect(simulatorService.start({ speed: 10 })).rejects.toThrowError(ConflictError);
    try {
      await simulatorService.start({ speed: 10 });
    } catch (err) {
      const confErr = err as ConflictError;
      expect(confErr.httpStatus).toBe(409);
      expect(confErr.code).toBe('SIMULATOR_RUNNING');
    }
  });

  it('stop() restores the SystemClock and removes sim-* sessions', async () => {
    await simulatorService.start({ speed: 6, peakPeople: 50, durationMin: 10 });

    // Seed a dummy sim session
    await sessionStore.start({
      sessionId: 'sim-test-session',
      userId: 'sim-user-1',
      mealId,
      messId,
      checkedInAt: clock.now(),
      expectedStayEndsAt: clock.now() + 18 * 60 * 1000,
      hardExpiresAt: clock.now() + 35 * 60 * 1000,
      geofence: 'unknown',
      method: 'sim',
    });

    // Also seed a real student session
    await sessionStore.start({
      sessionId: 'real-test-session',
      userId: 'student-real-user',
      mealId,
      messId,
      checkedInAt: clock.now(),
      expectedStayEndsAt: clock.now() + 18 * 60 * 1000,
      hardExpiresAt: clock.now() + 35 * 60 * 1000,
      geofence: 'inside',
      method: 'qr',
    });

    expect(await sessionStore.getActiveForUser('sim-user-1', mealId)).not.toBeNull();
    expect(await sessionStore.getActiveForUser('student-real-user', mealId)).not.toBeNull();

    // Stop simulation
    await simulatorService.stop();

    const status = simulatorService.status();
    expect(status.running).toBe(false);
    expect(status.runId).toBeNull();

    // sim- session is removed; real session is preserved!
    expect(await sessionStore.getActiveForUser('sim-user-1', mealId)).toBeNull();
    expect(await sessionStore.getActiveForUser('student-real-user', mealId)).not.toBeNull();
  });
});
