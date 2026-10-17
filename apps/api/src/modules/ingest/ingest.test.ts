/**
 * modules/ingest/ingest.test.ts — Unit and Integration tests for Ingest module.
 * DOC3 §3.2, DOC4 Step 7.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { InMemoryCameraReadingStore } from '../../infra/memory/camera-reading-store.memory';
import { InMemoryEntryVelocityStore } from '../../infra/memory/entry-velocity-store.memory';
import { EventBus } from '../../infra/event-bus';
import { IngestService } from './ingest.service';
import type { MealRepository, MealEntity } from '../../core/ports';
import { buildApp } from '../../app';
import { buildContainer } from '../../container';

const INGEST_KEY = 'test-ingest-key-1234';

class MockMealRepository implements MealRepository {
  public currentMeal: MealEntity | null = null;

  async findByMealId(): Promise<MealEntity | null> {
    return this.currentMeal;
  }

  async findActiveAt(): Promise<MealEntity | null> {
    return this.currentMeal;
  }

  async findActiveOrUpcoming(): Promise<MealEntity | null> {
    return this.currentMeal;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    this.currentMeal = { ...meal };
    return this.currentMeal;
  }

  async updateTrayCapacity(_messId: string, _mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    if (this.currentMeal) {
      this.currentMeal.trayCapacity = trayCapacity;
    }
    return this.currentMeal;
  }
}

describe('IngestService (Unit)', () => {
  let cameraStore: InMemoryCameraReadingStore;
  let velocityStore: InMemoryEntryVelocityStore;
  let mealRepo: MockMealRepository;
  let eventBus: EventBus;
  let ingestService: IngestService;

  beforeEach(() => {
    cameraStore = new InMemoryCameraReadingStore();
    velocityStore = new InMemoryEntryVelocityStore();
    mealRepo = new MockMealRepository();
    eventBus = new EventBus();
    ingestService = new IngestService(cameraStore, velocityStore, mealRepo, eventBus);
  });

  it('records initial reading, updates camera store and records velocity', async () => {
    const mealStart = 1000000;
    mealRepo.currentMeal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart,
      endsAt: mealStart + 3600000,
      menuItems: ['Rice', 'Dal'],
      menuDemandFactorMin: 2,
    };

    let publishedEvent: unknown = null;
    eventBus.subscribe('reading.recorded', (p) => {
      publishedEvent = p;
    });

    const now = mealStart + 60000;
    const result = await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 1,
        count: 10,
        inCount: 12,
        outCount: 2,
        capturedAt: now - 100,
      },
      now
    );

    expect(result).toEqual({ accepted: true });

    const stored = await cameraStore.getLatest('20261017-lunch');
    expect(stored).not.toBeNull();
    expect(stored?.seq).toBe(1);
    expect(stored?.count).toBe(10);
    expect(stored?.inCount).toBe(12);
    expect(stored?.outCount).toBe(2);
    expect(stored?.receivedAt).toBe(now);

    const velocityCount = await velocityStore.countSince('20261017-lunch', now - 1000);
    expect(velocityCount).toBe(12);

    expect(publishedEvent).toEqual({
      messId: 'mess-1',
      mealId: '20261017-lunch',
      seq: 1,
      count: 10,
      inCountDelta: 12,
    });
  });

  it('ignores duplicate or older seq and returns {accepted: true, ignored: true}', async () => {
    const now = 2000000;
    await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 5,
        count: 15,
        inCount: 20,
        outCount: 5,
        capturedAt: now,
      },
      now
    );

    // Duplicate seq
    const dupResult = await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 5,
        count: 16,
        inCount: 21,
        outCount: 5,
        capturedAt: now + 5000,
      },
      now + 5000
    );
    expect(dupResult).toEqual({ accepted: true, ignored: true });

    // Older seq
    const olderResult = await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 4,
        count: 14,
        inCount: 19,
        outCount: 5,
        capturedAt: now + 10000,
      },
      now + 10000
    );
    expect(olderResult).toEqual({ accepted: true, ignored: true });
  });

  it('captures cameraBaseline on the first reading inside baseline window', async () => {
    const mealStart = 3000000;
    mealRepo.currentMeal = {
      messId: 'mess-1',
      mealId: '20261017-dinner',
      type: 'dinner',
      startsAt: mealStart,
      endsAt: mealStart + 3600000,
      menuItems: ['Roti', 'Paneer'],
      menuDemandFactorMin: 1,
    };

    // Reading at startsAt - 2 min (inside [startsAt - 5 min ... startsAt + 2 min])
    const now = mealStart - 2 * 60 * 1000;
    await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 1,
        count: 3, // Baseline drift present when mess opens
        inCount: 3,
        outCount: 0,
        capturedAt: now,
      },
      now
    );

    const stored = await cameraStore.getLatest('20261017-dinner');
    expect(stored?.cameraBaseline).toBe(3);

    // Next reading keeps the established baseline
    await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 2,
        count: 15,
        inCount: 15,
        outCount: 0,
        capturedAt: now + 60000,
      },
      now + 60000
    );

    const stored2 = await cameraStore.getLatest('20261017-dinner');
    expect(stored2?.cameraBaseline).toBe(3);
  });

  it('handles counter reset mid-run cleanly (script restart)', async () => {
    const mealStart = 4000000;
    mealRepo.currentMeal = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      type: 'lunch',
      startsAt: mealStart,
      endsAt: mealStart + 3600000,
      menuItems: [],
      menuDemandFactorMin: 0,
    };

    // First run reaches inCount = 100
    await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 10,
        count: 40,
        inCount: 100,
        outCount: 60,
        capturedAt: mealStart + 10000,
      },
      mealStart + 10000
    );

    // Script restarts mid-meal: seq starts anew or increments, but inCount drops to 5
    let deltaObserved = 0;
    eventBus.subscribe('reading.recorded', (p) => {
      deltaObserved = p.inCountDelta;
    });

    const resetResult = await ingestService.recordReading(
      {
        messId: 'mess-1',
        seq: 11,
        count: 5,
        inCount: 5, // smaller than previous inCount (100) => counter reset
        outCount: 0,
        capturedAt: mealStart + 15000,
      },
      mealStart + 15000
    );

    expect(resetResult).toEqual({ accepted: true });
    expect(deltaObserved).toBe(5);
  });

  it('accepts off-hours reading when no meal is active', async () => {
    mealRepo.currentMeal = null; // No active meal
    const now = 5000000;

    const result = await ingestService.recordReading(
      {
        messId: 'mess-off',
        seq: 1,
        count: 0,
        inCount: 0,
        outCount: 0,
        capturedAt: now,
      },
      now
    );

    expect(result).toEqual({ accepted: true });
    const stored = await cameraStore.getLatest('mess-off:off-hours');
    expect(stored).not.toBeNull();
    expect(stored?.seq).toBe(1);
  });
});

describe('POST /api/v1/mess/live-count (Integration)', () => {
  let app: Application;
  let cameraStore: InMemoryCameraReadingStore;
  let mealRepo: MockMealRepository;

  beforeEach(() => {
    cameraStore = new InMemoryCameraReadingStore();
    mealRepo = new MockMealRepository();
    const container = buildContainer({
      cameraStore,
      mealRepo,
    });
    app = buildApp(container);
  });

  it('returns 401 AUTH_ERROR when X-Ingest-Key is missing or wrong', async () => {
    // Missing key
    const resNoKey = await request(app)
      .post('/api/v1/mess/live-count')
      .send({
        messId: 'mess-default',
        seq: 1,
        count: 5,
        inCount: 5,
        outCount: 0,
        capturedAt: Date.now(),
      });
    expect(resNoKey.status).toBe(401);
    expect(resNoKey.body.error.code).toBe('AUTH_ERROR');

    // Wrong key
    const resBadKey = await request(app)
      .post('/api/v1/mess/live-count')
      .set('X-Ingest-Key', 'wrong-key-1234')
      .send({
        messId: 'mess-default',
        seq: 1,
        count: 5,
        inCount: 5,
        outCount: 0,
        capturedAt: Date.now(),
      });
    expect(resBadKey.status).toBe(401);
    expect(resBadKey.body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 422 VALIDATION_ERROR when payload is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/mess/live-count')
      .set('X-Ingest-Key', INGEST_KEY)
      .send({
        messId: '', // Empty string violates .min(1)
        seq: -1,    // Negative seq violates .nonnegative()
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts valid payload with 200 OK and updates Redis/store', async () => {
    const res = await request(app)
      .post('/api/v1/mess/live-count')
      .set('X-Ingest-Key', INGEST_KEY)
      .send({
        messId: 'mess-default',
        seq: 1,
        count: 8,
        inCount: 10,
        outCount: 2,
        capturedAt: Date.now(),
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: true });

    // Subsequent duplicate seq returns {accepted: true, ignored: true}
    const dupRes = await request(app)
      .post('/api/v1/mess/live-count')
      .set('X-Ingest-Key', INGEST_KEY)
      .send({
        messId: 'mess-default',
        seq: 1,
        count: 8,
        inCount: 10,
        outCount: 2,
        capturedAt: Date.now(),
      });

    expect(dupRes.status).toBe(200);
    expect(dupRes.body).toEqual({ accepted: true, ignored: true });
  });
});
