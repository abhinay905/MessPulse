/**
 * modules/occupancy/occupancy.test.ts — Unit and integration tests for OccupancyService & Status API.
 * DOC3 §3.3, §3.5, DOC4 Step 8.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { StatusSnapshotSchema } from '@messpulse/shared';
import { InMemoryCameraReadingStore } from '../../infra/memory/camera-reading-store.memory';
import { InMemorySessionStore } from '../../infra/memory/session-store.memory';
import { InMemoryEntryVelocityStore } from '../../infra/memory/entry-velocity-store.memory';
import { EventBus } from '../../infra/event-bus';
import { OccupancyService } from './occupancy.service';
import { IngestService } from '../ingest/ingest.service';
import type {
  MealRepository,
  MealEntity,
  SettingsRepository,
  MessSettingsEntity,
  SnapshotRepository,
  OccupancySnapshotEntity,
} from '../../core/ports';
import { buildApp } from '../../app';
import { buildContainer } from '../../container';

class MockSettingsRepository implements SettingsRepository {
  public settings: MessSettingsEntity = {
    messId: 'mess-1',
    name: 'Hostel Mess',
    seatCapacity: 100,
    servicePerMin: 10,
    geofence: { lat: 12.9716, lng: 77.5946, radiusM: 100 },
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
  };

  async getByMessId(): Promise<MessSettingsEntity | null> {
    return this.settings;
  }

  async upsert(s: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    this.settings = { ...s };
    return this.settings;
  }
}

class MockMealRepository implements MealRepository {
  public meal: MealEntity | null = null;

  async findByMealId(): Promise<MealEntity | null> {
    return this.meal;
  }

  async findActiveAt(): Promise<MealEntity | null> {
    return this.meal;
  }

  async findActiveOrUpcoming(): Promise<MealEntity | null> {
    return this.meal;
  }

  async upsert(m: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    this.meal = { ...m };
    return this.meal;
  }

  async updateTrayCapacity(): Promise<MealEntity | null> {
    return this.meal;
  }
}

class MockSnapshotRepository implements SnapshotRepository {
  public saved: Array<Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>> = [];

  async save(snapshot: Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.saved.push(snapshot);
  }

  async queryHistory(): Promise<OccupancySnapshotEntity[]> {
    return [];
  }

  async getLatest(): Promise<OccupancySnapshotEntity | null> {
    return null;
  }
}

describe('OccupancyService', () => {
  let cameraStore: InMemoryCameraReadingStore;
  let sessionStore: InMemorySessionStore;
  let mealRepo: MockMealRepository;
  let settingsRepo: MockSettingsRepository;
  let snapshotRepo: MockSnapshotRepository;
  let eventBus: EventBus;
  let service: OccupancyService;

  beforeEach(() => {
    cameraStore = new InMemoryCameraReadingStore();
    sessionStore = new InMemorySessionStore();
    mealRepo = new MockMealRepository();
    settingsRepo = new MockSettingsRepository();
    snapshotRepo = new MockSnapshotRepository();
    eventBus = new EventBus();

    service = new OccupancyService(
      cameraStore,
      sessionStore,
      mealRepo,
      settingsRepo,
      snapshotRepo,
      eventBus,
      'mess-1'
    );
  });

  it('returns state: closed when no meal is active', async () => {
    mealRepo.meal = null;
    const now = 1000000;

    const snapshot = await service.tick(now, 'mess-1');
    expect(snapshot.state).toBe('closed');
    expect(snapshot.occupancy.value).toBe(0);
    expect(snapshot.occupancy.level).toBe('low');
    expect(snapshot.occupancy.source).toBe('sessions');
    expect(snapshot.occupancy.stale).toBe(true);
    expect(snapshot.waitMin).toBe(0);
    expect(snapshot.waitRangeMin).toEqual([0, 0]);
  });

  it('returns fresh camera occupancy when camera reading is recent', async () => {
    const mealStart = 2000000;
    mealRepo.meal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart,
      endsAt: mealStart + 7200000,
      menuItems: [],
      menuDemandFactorMin: 0,
    };

    const now = mealStart + 60000;
    await cameraStore.saveLatest('20261017-lunch', {
      seq: 1,
      count: 45,
      inCount: 50,
      outCount: 5,
      capturedAt: now - 2000,
      receivedAt: now - 2000, // 2s old < 30s staleCameraSec
      cameraBaseline: 0,
    });

    const snapshot = await service.tick(now, 'mess-1');

    expect(snapshot.state).toBe('open');
    expect(snapshot.occupancy.value).toBe(45);
    expect(snapshot.occupancy.source).toBe('camera');
    expect(snapshot.occupancy.stale).toBe(false);
    expect(snapshot.occupancy.level).toBe('low'); // 45 / 100 < 0.5
    expect(snapshot.camera.stale).toBe(false);
    expect(snapshot.camera.lastSeenAt).toBe(now - 2000);
  });

  it('flips to stale: true and source: sessions when camera reading exceeds staleCameraSec (31s)', async () => {
    const mealStart = 3000000;
    mealRepo.meal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart,
      endsAt: mealStart + 7200000,
      menuItems: [],
      menuDemandFactorMin: 0,
    };

    const now = mealStart + 60000;
    await cameraStore.saveLatest('20261017-lunch', {
      seq: 1,
      count: 85,
      inCount: 90,
      outCount: 5,
      capturedAt: now - 35000,
      receivedAt: now - 31000, // 31s old > 30s staleCameraSec
    });

    const snapshot = await service.tick(now, 'mess-1');

    expect(snapshot.state).toBe('open');
    expect(snapshot.occupancy.source).toBe('sessions');
    expect(snapshot.occupancy.stale).toBe(true);
    expect(snapshot.camera.stale).toBe(true);
  });

  it('saves snapshot to snapshotRepo every 30 seconds', async () => {
    const mealStart = 4000000;
    mealRepo.meal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart,
      endsAt: mealStart + 7200000,
      menuItems: [],
      menuDemandFactorMin: 0,
    };

    // First tick at T=0
    await service.tick(mealStart, 'mess-1');
    expect(snapshotRepo.saved.length).toBe(1);

    // Tick at T+10s (should not save again yet)
    await service.tick(mealStart + 10000, 'mess-1');
    expect(snapshotRepo.saved.length).toBe(1);

    // Tick at T+30s (should trigger second save)
    await service.tick(mealStart + 30000, 'mess-1');
    expect(snapshotRepo.saved.length).toBe(2);
  });
});

describe('Status API & Ingest Loop Integration', () => {
  let app: Application;
  let cameraStore: InMemoryCameraReadingStore;
  let sessionStore: InMemorySessionStore;
  let mealRepo: MockMealRepository;
  let settingsRepo: MockSettingsRepository;
  let snapshotRepo: MockSnapshotRepository;
  let eventBus: EventBus;
  let occupancyService: OccupancyService;
  let ingestService: IngestService;

  beforeEach(() => {
    cameraStore = new InMemoryCameraReadingStore();
    sessionStore = new InMemorySessionStore();
    mealRepo = new MockMealRepository();
    settingsRepo = new MockSettingsRepository();
    snapshotRepo = new MockSnapshotRepository();
    eventBus = new EventBus();

    occupancyService = new OccupancyService(
      cameraStore,
      sessionStore,
      mealRepo,
      settingsRepo,
      snapshotRepo,
      eventBus,
      'mess-1'
    );

    const velocityStore = new InMemoryEntryVelocityStore();
    ingestService = new IngestService(cameraStore, velocityStore, mealRepo, eventBus);

    const container = buildContainer({
      cameraStore,
      velocityStore,
      sessionStore,
      mealRepo,
      settingsRepo,
      snapshotRepo,
      eventBus,
      occupancyService,
      ingestService,
    });

    app = buildApp(container);
  });

  it('GET /api/v1/mess/:messId/status returns zod-compliant StatusSnapshot', async () => {
    const res = await request(app).get('/api/v1/mess/mess-1/status');
    expect(res.status).toBe(200);

    const parsed = StatusSnapshotSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it('posting readings changes GET /status within one tick', async () => {
    const mealStart = Date.now();
    mealRepo.meal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart - 600000,
      endsAt: mealStart + 3600000,
      menuItems: ['Curry'],
      menuDemandFactorMin: 0,
    };

    // 1. Post live count reading via Step 7 ingest route
    const ingestRes = await request(app)
      .post('/api/v1/mess/live-count')
      .set('X-Ingest-Key', 'test-ingest-key-1234')
      .send({
        messId: 'mess-1',
        seq: 1,
        count: 75,
        inCount: 80,
        outCount: 5,
        capturedAt: mealStart,
      });
    expect(ingestRes.status).toBe(200);

    // 2. Run one tick
    await occupancyService.tick(mealStart, 'mess-1');

    // 3. GET /status reflects the new reading
    const statusRes = await request(app).get('/api/v1/mess/mess-1/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.occupancy.value).toBe(75);
    expect(statusRes.body.occupancy.source).toBe('camera');
    expect(statusRes.body.occupancy.stale).toBe(false);
  });
});
