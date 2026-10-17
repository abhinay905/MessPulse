/**
 * modules/alerts/alerts.service.test.ts — unit & service tests for AlertService & AlertEngine.
 * DOC3 §3.6, DOC4 Step 13.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertEngine } from './alert-engine';
import { TrayDepletionRule } from './rules/tray-depletion.rule';
import { AlertService } from './alerts.service';
import type { AlertRule } from './alert-rule';
import type {
  AlertEntity,
  AlertRepository,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  SettingsRepository,
} from './alerts.ports';
import { InMemoryEntryVelocityStore } from '../../infra/memory/entry-velocity-store.memory';
import { InMemoryCameraReadingStore } from '../../infra/memory/camera-reading-store.memory';
import { EventBus } from '../../infra/event-bus';
import type { Clock } from '../../infra/clock';

class InMemoryAlertRepository implements AlertRepository {
  private alerts: AlertEntity[] = [];
  private idCounter = 1;

  async create(alert: Omit<AlertEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertEntity> {
    const created: AlertEntity = {
      ...alert,
      id: `alert-${this.idCounter++}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.alerts.push(created);
    return created;
  }

  async findOpen(messId: string, mealId: string, ruleId: string): Promise<AlertEntity | null> {
    const found = this.alerts.find(
      (a) => a.messId === messId && a.mealId === mealId && a.ruleId === ruleId && !a.clearedAt
    );
    return found ? { ...found } : null;
  }

  async list(messId: string, options: { openOnly?: boolean; limit?: number } = {}): Promise<AlertEntity[]> {
    let list = this.alerts.filter((a) => a.messId === messId);
    if (options.openOnly) {
      list = list.filter((a) => !a.clearedAt);
    }
    list = [...list].sort((a, b) => b.raisedAt - a.raisedAt);
    if (options.limit) {
      list = list.slice(0, options.limit);
    }
    return list.map((a) => ({ ...a }));
  }

  async ack(alertId: string, ackedBy: string, ackedAt: number): Promise<AlertEntity | null> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return null;
    alert.ackedBy = ackedBy;
    alert.ackedAt = ackedAt;
    return { ...alert };
  }

  async clear(alertId: string, clearedAt: number): Promise<AlertEntity | null> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return null;
    alert.clearedAt = clearedAt;
    return { ...alert };
  }
}

class FakeMealRepository implements MealRepository {
  public activeMeal: MealEntity | null = null;

  async findByMealId(_messId: string, mealId: string): Promise<MealEntity | null> {
    void _messId;
    if (this.activeMeal && this.activeMeal.mealId === mealId) {
      return this.activeMeal;
    }
    return null;
  }

  async findActiveAt(messId: string, now: number): Promise<MealEntity | null> {
    void messId;
    void now;
    return this.activeMeal;
  }

  async findActiveOrUpcoming(messId: string, now: number): Promise<MealEntity | null> {
    void messId;
    void now;
    return this.activeMeal;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    this.activeMeal = { ...meal, id: 'm-1', createdAt: new Date(), updatedAt: new Date() };
    return this.activeMeal;
  }

  async updateTrayCapacity(_messId: string, _mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    void _messId;
    void _mealId;
    if (!this.activeMeal) return null;
    this.activeMeal.trayCapacity = trayCapacity;
    return this.activeMeal;
  }
}

class FakeSettingsRepository implements SettingsRepository {
  async getByMessId(messId: string): Promise<MessSettingsEntity | null> {
    return {
      messId,
      name: 'Test Mess',
      seatCapacity: 200,
      servicePerMin: 12,
      geofence: { lat: 0, lng: 0, radiusM: 100 },
      decay: { tail: [] },
      baseMealMin: 18,
      maxSessionMin: 60,
      staleCameraSec: 30,
      alertThresholds: { cooldownSec: 180 },
      updatedAt: new Date(),
    };
  }

  async upsert(settings: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    return { ...settings, updatedAt: new Date() };
  }
}

class FakeClock implements Clock {
  constructor(public current: number) {}
  now(): number {
    return this.current;
  }
}

describe('AlertEngine & AlertService', () => {
  let alertEngine: AlertEngine;
  let alertRepo: InMemoryAlertRepository;
  let mealRepo: FakeMealRepository;
  let settingsRepo: FakeSettingsRepository;
  let velocityStore: InMemoryEntryVelocityStore;
  let cameraStore: InMemoryCameraReadingStore;
  let eventBus: EventBus;
  let clock: FakeClock;
  let service: AlertService;

  const baseNow = 1700000000000;
  const messId = 'mess-test';
  const mealId = 'meal-lunch-1';

  beforeEach(() => {
    alertEngine = new AlertEngine();
    alertEngine.register(new TrayDepletionRule());

    alertRepo = new InMemoryAlertRepository();
    mealRepo = new FakeMealRepository();
    settingsRepo = new FakeSettingsRepository();
    velocityStore = new InMemoryEntryVelocityStore();
    cameraStore = new InMemoryCameraReadingStore();
    eventBus = new EventBus();
    clock = new FakeClock(baseNow);

    mealRepo.activeMeal = {
      id: 'm-1',
      messId,
      mealId,
      type: 'lunch',
      startsAt: baseNow - 30 * 60 * 1000,
      endsAt: baseNow + 60 * 60 * 1000,
      menuItems: ['Rice', 'Dal', 'Paneer'],
      menuDemandFactorMin: 0,
      trayCapacity: 100, // 100 portions configured
    };

    service = new AlertService(
      alertEngine,
      alertRepo,
      mealRepo,
      velocityStore,
      cameraStore,
      settingsRepo,
      eventBus,
      clock
    );
  });

  it('skips rule evaluation when tray capacity is not set', async () => {
    if (mealRepo.activeMeal) {
      mealRepo.activeMeal.trayCapacity = undefined;
    }
    await service.handleTick(baseNow, messId);

    const openAlerts = await alertRepo.list(messId, { openOnly: true });
    expect(openAlerts).toHaveLength(0);
  });

  it('raises alert when consumption projection exceeds 0.85 warnRatio', async () => {
    // Current inCount = 70. Velocity = 2 entries/min.
    // Projected in next 10 min = 70 + (2 * 10) = 90.
    // Ratio = 90 / 100 = 0.90 >= 0.85 => RAISE
    await cameraStore.saveLatest(mealId, {
      seq: 1,
      count: 50,
      inCount: 70,
      outCount: 20,
      capturedAt: baseNow,
      receivedAt: baseNow,
    });
    // Record 10 entries in last 5 min => 2 per min
    await velocityStore.record(mealId, 'e-1', baseNow - 60000, 10);

    const raisedEvents: unknown[] = [];
    eventBus.subscribe('alert.raised', (e) => {
      raisedEvents.push(e);
    });

    await service.handleTick(baseNow, messId);

    const openAlerts = await alertRepo.list(messId, { openOnly: true });
    expect(openAlerts).toHaveLength(1);
    expect(openAlerts[0]?.ruleId).toBe('tray-depletion');
    expect(openAlerts[0]?.severity).toBe('warning');
    expect(openAlerts[0]?.payload['message']).toContain('Trays may run out');
    expect(raisedEvents).toHaveLength(1);
  });

  it('does not duplicate open alert if already raised and not cleared', async () => {
    if (mealRepo.activeMeal) {
      mealRepo.activeMeal.trayCapacity = 100;
    }
    // Pre-create an open alert
    await alertRepo.create({
      messId,
      mealId,
      ruleId: 'tray-depletion',
      severity: 'warning',
      payload: { message: 'Already running low' },
      raisedAt: baseNow - 10000,
    });

    const raisedEvents: unknown[] = [];
    eventBus.subscribe('alert.raised', (e) => {
      raisedEvents.push(e);
    });

    await service.handleTick(baseNow, messId);

    expect(raisedEvents).toHaveLength(0);
    const all = await alertRepo.list(messId);
    expect(all).toHaveLength(1);
  });

  it('clears alert when capacity is refilled below clearRatio (0.70)', async () => {
    // Alert was raised
    const alert = await alertRepo.create({
      messId,
      mealId,
      ruleId: 'tray-depletion',
      severity: 'warning',
      payload: { message: 'Running low' },
      raisedAt: baseNow - 30000,
    });

    // Staff refills trays: capacity increased to 300
    // With inCount=70, 2 per min: (70 + 20) / 300 = 0.30 < 0.70 => clear
    await cameraStore.saveLatest(mealId, {
      seq: 1,
      count: 40,
      inCount: 70,
      outCount: 30,
      capturedAt: baseNow,
      receivedAt: baseNow,
    });
    await velocityStore.record(mealId, 'e-1', baseNow - 60000, 10);
    if (mealRepo.activeMeal) {
      mealRepo.activeMeal.trayCapacity = 300;
    }

    const clearedEvents: Array<{ id: string }> = [];
    eventBus.subscribe('alert.cleared', (e) => {
      clearedEvents.push(e as { id: string });
    });

    await service.handleTick(baseNow, messId);

    const openAlerts = await alertRepo.list(messId, { openOnly: true });
    expect(openAlerts).toHaveLength(0);

    const updated = await alertRepo.findOpen(messId, mealId, 'tray-depletion');
    expect(updated).toBeNull();

    expect(clearedEvents).toHaveLength(1);
    expect(clearedEvents[0]?.id).toBe(alert.id);
  });

  it('enforces 3-min cooldown preventing immediate re-raise after clear', async () => {
    // 1. Alert cleared at T0
    await alertRepo.create({
      messId,
      mealId,
      ruleId: 'tray-depletion',
      severity: 'warning',
      payload: { message: 'Low' },
      raisedAt: baseNow - 10000,
    });
    // Clear alert
    if (mealRepo.activeMeal) {
      mealRepo.activeMeal.trayCapacity = 300;
    }
    await service.handleTick(baseNow, messId);

    // 2. 60 seconds later, condition spikes again (capacity lowered to 90)
    const tSpike = baseNow + 60000;
    if (mealRepo.activeMeal) {
      mealRepo.activeMeal.trayCapacity = 90;
    }
    await cameraStore.saveLatest(mealId, {
      seq: 2,
      count: 60,
      inCount: 80,
      outCount: 20,
      capturedAt: tSpike,
      receivedAt: tSpike,
    });

    const raisedEvents: unknown[] = [];
    eventBus.subscribe('alert.raised', (e) => {
      raisedEvents.push(e);
    });

    await service.handleTick(tSpike, messId);

    // Should NOT re-raise because 60s < 180s cooldown
    expect(raisedEvents).toHaveLength(0);

    // 3. Past 180s cooldown: tReRaise = baseNow + 190s -> should now re-raise
    const tReRaise = baseNow + 190000;
    await service.handleTick(tReRaise, messId);
    expect(raisedEvents).toHaveLength(1);
  });

  it('automatically clears all open alerts when active meal ends', async () => {
    await alertRepo.create({
      messId,
      mealId,
      ruleId: 'tray-depletion',
      severity: 'warning',
      payload: { message: 'Ending meal alert' },
      raisedAt: baseNow - 5000,
    });

    mealRepo.activeMeal = null; // Meal ended

    await service.handleTick(baseNow, messId);

    const openAlerts = await alertRepo.list(messId, { openOnly: true });
    expect(openAlerts).toHaveLength(0);
  });

  it('acknowledging an alert marks ackedBy and ackedAt without clearing', async () => {
    const alert = await alertRepo.create({
      messId,
      mealId,
      ruleId: 'tray-depletion',
      severity: 'warning',
      payload: { message: 'Low trays' },
      raisedAt: baseNow - 5000,
    });

    const alertId = alert.id ?? 'alert-1';
    const acked = await service.ackAlert(alertId, 'staff-john', baseNow);
    expect(acked.ackedAt).toBe(baseNow);
    expect(acked.clearedAt).toBeUndefined();

    const open = await alertRepo.findOpen(messId, mealId, 'tray-depletion');
    expect(open).not.toBeNull();
    expect(open?.ackedBy).toBe('staff-john');
    expect(open?.clearedAt).toBeUndefined();
  });

  it('a throwing rule in AlertEngine is isolated and does not stop other rules', async () => {
    const throwingRule: AlertRule = {
      id: 'faulty-sensor-rule',
      evaluate: () => {
        throw new Error('Database connection failed in rule');
      },
    };

    const healthyRule: AlertRule = {
      id: 'healthy-rule',
      evaluate: () => ({ action: 'raise', message: 'Healthy rule fired' }),
    };

    const isolatedEngine = new AlertEngine();
    isolatedEngine.register(throwingRule);
    isolatedEngine.register(healthyRule);

    const activeMeal = mealRepo.activeMeal ?? {
      id: 'm-1',
      messId,
      mealId,
      type: 'lunch',
      startsAt: baseNow - 1000,
      endsAt: baseNow + 1000,
      menuItems: [],
      menuDemandFactorMin: 0,
    };
    const settings = (await settingsRepo.getByMessId(messId)) ?? {
      messId,
      name: 'Test',
      seatCapacity: 200,
      servicePerMin: 12,
      geofence: { lat: 0, lng: 0, radiusM: 100 },
      decay: { tail: [] },
      baseMealMin: 18,
      maxSessionMin: 60,
      staleCameraSec: 30,
      alertThresholds: {},
    };

    const ctx = {
      messId,
      mealId,
      now: baseNow,
      meal: activeMeal,
      settings,
      velocityPerMin: 2,
      enteredSoFar: 50,
      openAlert: null,
    };

    const outcomes = await isolatedEngine.evaluate(ctx);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.ruleId).toBe('faulty-sensor-rule');
    expect(outcomes[0]?.outcome.action).toBe('none');
    expect(outcomes[1]?.ruleId).toBe('healthy-rule');
    expect(outcomes[1]?.outcome.action).toBe('raise');
  });

  it('updateTrayCapacity validates bounds and triggers tick', async () => {
    await expect(service.updateTrayCapacity(mealId, 0)).rejects.toThrow();
    await expect(service.updateTrayCapacity(mealId, -5)).rejects.toThrow();
    await expect(service.updateTrayCapacity(mealId, 15000)).rejects.toThrow();
    await expect(service.updateTrayCapacity(mealId, 50.5)).rejects.toThrow();

    const res = await service.updateTrayCapacity(mealId, 250);
    expect(res).toEqual({ mealId, capacityPortions: 250 });
    expect(mealRepo.activeMeal?.trayCapacity).toBe(250);
  });
});
