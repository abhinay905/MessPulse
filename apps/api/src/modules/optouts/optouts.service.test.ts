/**
 * modules/optouts/optouts.service.test.ts — Unit and scenario tests for OptOutService.
 * DOC3 §3.13, DOC4 Step 17.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OptOutService } from './optouts.service';
import type { Clock } from '../../infra/clock';
import { EventBus } from '../../infra/event-bus';
import { ValidationError, NotFoundError } from '../../shared-kernel/errors';
import type {
  OptOutRepository,
  MealRepository,
  SettingsRepository,
  OptOutEntity,
  MealEntity,
  MessSettingsEntity,
} from './optouts.ports';

class FakeOptOutRepository implements OptOutRepository {
  private items = new Map<string, OptOutEntity>();

  async upsert(userId: string, mealId: string): Promise<OptOutEntity> {
    const key = `${userId}:${mealId}`;
    const entity: OptOutEntity = {
      id: `id-${key}`,
      userId,
      mealId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.set(key, entity);
    return entity;
  }

  async remove(userId: string, mealId: string): Promise<boolean> {
    return this.items.delete(`${userId}:${mealId}`);
  }

  async findByUserMeal(userId: string, mealId: string): Promise<OptOutEntity | null> {
    return this.items.get(`${userId}:${mealId}`) ?? null;
  }

  async countByMeal(mealId: string): Promise<number> {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.mealId === mealId) count++;
    }
    return count;
  }
}

class FakeMealRepository implements MealRepository {
  public meals: MealEntity[] = [];

  async findByMealId(_messId: string, mealId: string): Promise<MealEntity | null> {
    return this.meals.find((m) => m.mealId === mealId) ?? null;
  }

  async findActiveAt(): Promise<MealEntity | null> { return null; }
  async findActiveOrUpcoming(): Promise<MealEntity | null> { return null; }
  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    return { ...meal, id: 'meal-1' };
  }
  async updateTrayCapacity(): Promise<MealEntity | null> { return null; }
}

class FakeSettingsRepository implements SettingsRepository {
  public settings: MessSettingsEntity | null = null;

  async getByMessId(): Promise<MessSettingsEntity | null> {
    return this.settings;
  }

  async upsert(s: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    return { ...s, id: 'settings-1' };
  }
}

class FakeClock implements Clock {
  constructor(public current: number) {}
  now(): number {
    return this.current;
  }
}

describe('OptOutService', () => {
  let service: OptOutService;
  let optOutRepo: FakeOptOutRepository;
  let mealRepo: FakeMealRepository;
  let settingsRepo: FakeSettingsRepository;
  let clock: FakeClock;
  let eventBus: EventBus;

  const mealStartsAt = 1700000000000;
  const cutoffMin = 60; // cutoff is at 1699996400000 (mealStartsAt - 60 min)
  const cutoffAt = mealStartsAt - cutoffMin * 60 * 1000;

  beforeEach(() => {
    optOutRepo = new FakeOptOutRepository();
    mealRepo = new FakeMealRepository();
    settingsRepo = new FakeSettingsRepository();
    clock = new FakeClock(cutoffAt - 10000); // 10s before cutoff
    eventBus = new EventBus();

    mealRepo.meals = [
      {
        id: 'm1',
        messId: 'mess-1',
        mealId: '20261017-lunch',
        type: 'lunch',
        startsAt: mealStartsAt,
        endsAt: mealStartsAt + 7200000,
        menuItems: ['Dal Tadka', 'Jeera Rice'],
        menuDemandFactorMin: 2,
      },
    ];

    settingsRepo.settings = {
      id: 's1',
      messId: 'mess-1',
      name: 'Hostel Mess',
      seatCapacity: 200,
      servicePerMin: 15,
      geofence: { lat: 12.97, lng: 77.59, radiusM: 100 },
      baseMealMin: 18,
      maxSessionMin: 60,
      decay: { tail: [{ untilOffsetMin: 8, weight: 0.6 }] },
      staleCameraSec: 30,
      alertThresholds: {},
      optOutCutoffMin: cutoffMin,
    };

    service = new OptOutService(optOutRepo, mealRepo, settingsRepo, eventBus, clock, 'mess-1');
  });

  it('allows opt-out before cutoff and publishes optout.changed', async () => {
    let publishedEvent: unknown = null;
    eventBus.subscribe('optout.changed', (payload) => {
      publishedEvent = payload;
    });

    const res = await service.set('user-1', '20261017-lunch');
    expect(res.optedOut).toBe(true);
    expect(res.cutoffAt).toBe(cutoffAt);

    expect(await optOutRepo.countByMeal('20261017-lunch')).toBe(1);
    expect(publishedEvent).toEqual({
      messId: 'mess-1',
      mealId: '20261017-lunch',
      userId: 'user-1',
      optedOut: true,
      at: clock.now(),
    });
  });

  it('rejects opt-out at or after cutoff with 422 OPTOUT_WINDOW_CLOSED', async () => {
    clock.current = cutoffAt; // exactly at cutoff

    await expect(service.set('user-1', '20261017-lunch')).rejects.toThrowError(
      expect.objectContaining({
        code: 'OPTOUT_WINDOW_CLOSED',
        httpStatus: 422,
      })
    );

    clock.current = cutoffAt + 1000; // 1s after cutoff
    await expect(service.set('user-1', '20261017-lunch')).rejects.toThrowError(ValidationError);
  });

  it('throws NotFoundError for non-existent meal', async () => {
    await expect(service.set('user-1', 'non-existent-meal')).rejects.toThrowError(NotFoundError);
  });

  it('removes opt-out before cutoff and publishes optout.changed false', async () => {
    await service.set('user-1', '20261017-lunch');
    expect(await optOutRepo.countByMeal('20261017-lunch')).toBe(1);

    let publishedEvent: unknown = null;
    eventBus.subscribe('optout.changed', (payload) => {
      publishedEvent = payload;
    });

    await service.remove('user-1', '20261017-lunch');
    expect(await optOutRepo.countByMeal('20261017-lunch')).toBe(0);
    expect(publishedEvent).toEqual({
      messId: 'mess-1',
      mealId: '20261017-lunch',
      userId: 'user-1',
      optedOut: false,
      at: clock.now(),
    });
  });

  it('rejects removal after cutoff with OPTOUT_WINDOW_CLOSED', async () => {
    await service.set('user-1', '20261017-lunch');

    clock.current = cutoffAt + 5000;
    await expect(service.remove('user-1', '20261017-lunch')).rejects.toThrowError(
      expect.objectContaining({
        code: 'OPTOUT_WINDOW_CLOSED',
        httpStatus: 422,
      })
    );
  });

  it('getMine accurately returns status and cutoff timestamp', async () => {
    const before = await service.getMine('user-1', '20261017-lunch');
    expect(before.optedOut).toBe(false);
    expect(before.cutoffAt).toBe(cutoffAt);

    await service.set('user-1', '20261017-lunch');

    const after = await service.getMine('user-1', '20261017-lunch');
    expect(after.optedOut).toBe(true);
    expect(after.cutoffAt).toBe(cutoffAt);
  });

  it('countForMeal returns accurate count', async () => {
    expect(await service.countForMeal('20261017-lunch')).toBe(0);
    await service.set('user-1', '20261017-lunch');
    await service.set('user-2', '20261017-lunch');
    expect(await service.countForMeal('20261017-lunch')).toBe(2);
  });
});
