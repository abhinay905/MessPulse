/**
 * modules/occupancy/occupancy.service.ts — Unified live occupancy reconciliation service.
 * DOC3 §3.3, §3.5, DOC4 Step 8.
 * Pure orchestration: calls core/ functions, reads stores, caches, and publishes status.updated.
 */

import type { StatusSnapshot } from '@messpulse/shared';
import type {
  CameraReadingStore,
  SessionStore,
  MealRepository,
  SettingsRepository,
  SnapshotRepository,
  MessSettingsEntity,
  MealEntity,
} from '../../core/ports';
import type { EventBus } from '../../infra/event-bus';
import { logger } from '../../infra/logger';
import { sumSessionWeights } from '../../core/decay';
import {
  selectOccupancy,
  calibrationRatio,
  estimateWaitMin,
  waitRange,
  occupancyLevel,
  smoothEma,
} from '../../core/occupancy';
import { suggestBestWindows, type BaselineProfile } from '../../core/windows';

const DEFAULT_BASELINE_PROFILE: BaselineProfile = {
  name: 'default-lunch-wave',
  mealType: 'lunch',
  buckets: [
    { minuteOffset: 0, relativeOccupancy: 0.1 },
    { minuteOffset: 15, relativeOccupancy: 0.4 },
    { minuteOffset: 30, relativeOccupancy: 0.8 },
    { minuteOffset: 45, relativeOccupancy: 0.9 },
    { minuteOffset: 60, relativeOccupancy: 0.6 },
    { minuteOffset: 75, relativeOccupancy: 0.3 },
    { minuteOffset: 90, relativeOccupancy: 0.1 },
  ],
};

const DEFAULT_FALLBACK_SETTINGS: MessSettingsEntity = {
  messId: 'mess-default',
  name: 'Default Mess',
  seatCapacity: 200,
  servicePerMin: 15,
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

export class OccupancyService {
  private readonly cachedSnapshots = new Map<string, StatusSnapshot>();
  private readonly cachedSettings = new Map<string, { data: MessSettingsEntity; expiresAt: number }>();
  private readonly cachedMeals = new Map<string, { data: MealEntity | null; expiresAt: number }>();
  private readonly lastRatio = new Map<string, number | null>();
  private readonly lastEmaWait = new Map<string, number | null>();
  private readonly lastSnapshotSavedAt = new Map<string, number>();

  constructor(
    private readonly cameraStore: CameraReadingStore,
    private readonly sessionStore: SessionStore,
    private readonly mealRepo: MealRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly snapshotRepo: SnapshotRepository,
    private readonly eventBus: EventBus,
    private readonly defaultMessId = 'mess-default'
  ) {}

  private async getSettings(messId: string, now: number): Promise<MessSettingsEntity> {
    const cached = this.cachedSettings.get(messId);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
    const settings = await this.settingsRepo.getByMessId(messId);
    const resolved = settings ?? { ...DEFAULT_FALLBACK_SETTINGS, messId };
    this.cachedSettings.set(messId, { data: resolved, expiresAt: now + 30_000 });
    return resolved;
  }

  private async getMeal(messId: string, now: number): Promise<MealEntity | null> {
    const cached = this.cachedMeals.get(messId);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
    const meal = await this.mealRepo.findActiveAt(messId, now);
    this.cachedMeals.set(messId, { data: meal, expiresAt: now + 30_000 });
    return meal;
  }

  /**
   * Execute 1-second tick: gathers stores, resolves occupancy, publishes status.updated.
   * Never throws — publishes last good snapshot with stale:true on failure.
   */
  async tick(now: number, messId = this.defaultMessId): Promise<StatusSnapshot> {
    try {
      const settings = await this.getSettings(messId, now);
      const meal = await this.getMeal(messId, now);

      // Case 1: Mess is closed (no active meal)
      if (!meal) {
        const closedSnapshot: StatusSnapshot = {
          messId,
          mealId: null,
          ts: now,
          state: 'closed',
          occupancy: {
            value: 0,
            capacity: settings.seatCapacity,
            level: 'low',
            source: 'sessions',
            stale: true,
          },
          activeSessions: 0,
          decayWeightedSessions: 0,
          waitMin: 0,
          waitRangeMin: [0, 0],
          bestWindows: [],
          camera: {
            lastSeenAt: null,
            stale: true,
          },
        };

        this.cachedSnapshots.set(messId, closedSnapshot);
        this.eventBus.publish('status.updated', closedSnapshot);
        return closedSnapshot;
      }

      // Case 2: Active meal
      const camera = await this.cameraStore.getLatest(meal.mealId);
      const activeSessions = await this.sessionStore.listActive(meal.mealId, now);

      const decaySessions = activeSessions.map((s) => ({
        checkedInAt: s.checkedInAt,
        expectedStaySec: Math.max(0, (s.expectedStayEndsAt - s.checkedInAt) / 1000),
        hardExpirySec: Math.max(0, (s.hardExpiresAt - s.checkedInAt) / 1000),
      }));

      const decayWeighted = sumSessionWeights(decaySessions, now, settings.decay);
      const cameraBaseline = camera?.cameraBaseline ?? 0;

      const selectResult = selectOccupancy({
        camera,
        cameraBaseline,
        decayWeighted,
        lastRatio: this.lastRatio.get(messId) ?? null,
        now,
        staleCameraSec: settings.staleCameraSec,
      });

      if (selectResult.ratio !== null) {
        const updatedRatio = calibrationRatio(this.lastRatio.get(messId) ?? null, selectResult.ratio);
        this.lastRatio.set(messId, updatedRatio);
      }

      const rawWait = estimateWaitMin({
        occupancy: selectResult.value,
        seatCapacity: settings.seatCapacity,
        servicePerMin: settings.servicePerMin,
      });

      const prevEma = this.lastEmaWait.get(messId) ?? null;
      const smoothWait = smoothEma(prevEma, rawWait);
      this.lastEmaWait.set(messId, smoothWait);

      const waitRounded = Math.round(smoothWait);
      const range = waitRange(waitRounded);
      const level = occupancyLevel(selectResult.value, settings.seatCapacity);

      const bestWindows = suggestBestWindows([], DEFAULT_BASELINE_PROFILE, now, 60, {
        seatCapacity: settings.seatCapacity,
        servicePerMin: settings.servicePerMin,
        mealStartMs: meal.startsAt,
      });

      const lastSeenAt = camera ? camera.capturedAt : null;
      const cameraStale = selectResult.source === 'sessions' || selectResult.stale;

      const snapshot: StatusSnapshot = {
        messId,
        mealId: meal.mealId,
        ts: now,
        state: 'open',
        occupancy: {
          value: selectResult.value,
          capacity: settings.seatCapacity,
          level,
          source: selectResult.source,
          stale: selectResult.stale,
        },
        activeSessions: activeSessions.length,
        decayWeightedSessions: Number(decayWeighted.toFixed(2)),
        waitMin: waitRounded,
        waitRangeMin: range,
        bestWindows,
        camera: {
          lastSeenAt,
          stale: cameraStale,
        },
      };

      this.cachedSnapshots.set(messId, snapshot);
      this.eventBus.publish('status.updated', snapshot);

      // Snapshot save every 30 s
      const lastSaved = this.lastSnapshotSavedAt.get(messId) ?? 0;
      if (now - lastSaved >= 30_000) {
        this.lastSnapshotSavedAt.set(messId, now);
        void this.snapshotRepo.save({
          messId,
          mealId: meal.mealId,
          ts: now,
          cameraCount: camera?.count ?? 0,
          sessionEstimate: Math.round(decayWeighted * (this.lastRatio.get(messId) ?? 1)),
          decayWeighted: Number(decayWeighted.toFixed(2)),
          estWaitMin: waitRounded,
        }).catch((err) => {
          logger.error({ err, messId }, 'Failed to save occupancy snapshot to Mongo');
        });
      }

      return snapshot;
    } catch (err) {
      logger.error({ err, messId }, 'OccupancyService tick error; preserving last snapshot as stale');
      const fallback = this.cachedSnapshots.get(messId) ?? this.warmingUpSnapshot(messId, now);
      const staleSnapshot: StatusSnapshot = {
        ...fallback,
        ts: now,
        occupancy: {
          ...fallback.occupancy,
          stale: true,
          source: 'sessions',
        },
        camera: {
          ...fallback.camera,
          stale: true,
        },
      };
      this.cachedSnapshots.set(messId, staleSnapshot);
      this.eventBus.publish('status.updated', staleSnapshot);
      return staleSnapshot;
    }
  }

  private warmingUpSnapshot(messId: string, now: number): StatusSnapshot {
    return {
      messId,
      mealId: null,
      ts: now,
      state: 'closed',
      occupancy: {
        value: 0,
        capacity: 200,
        level: 'low',
        source: 'sessions',
        stale: true,
      },
      activeSessions: 0,
      decayWeightedSessions: 0,
      waitMin: 0,
      waitRangeMin: [0, 0],
      bestWindows: [],
      camera: {
        lastSeenAt: null,
        stale: true,
      },
    };
  }

  /**
   * Returns cached snapshot (no recompute per request).
   */
  getLatest(messId = this.defaultMessId): StatusSnapshot {
    return this.cachedSnapshots.get(messId) ?? this.warmingUpSnapshot(messId, Date.now());
  }

  /**
   * Implements QueueWaitProvider for SessionsService (DOC3 §3.4).
   * Returns estimated wait in seconds for the given meal, or 0 if no wait / not matching.
   */
  async getEstimatedWaitSec(mealId: string, messId = this.defaultMessId): Promise<number> {
    const snapshot = this.getLatest(messId);
    if (snapshot.mealId === mealId && snapshot.waitMin > 0) {
      return Math.round(snapshot.waitMin * 60);
    }
    return 0;
  }
}
