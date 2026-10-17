/**
 * modules/admin/admin.service.ts — Admin service for analytics, settings, and check-in QR.
 * DOC3 §3.7, DOC4 Step 14.
 */

import {
  SettingsPatchSchema,
  SettingsDTOSchema,
  type SettingsDTO,
  type SettingsPatch,
  type TimeSeriesPoint,
  type DecayCurveResponse,
  type DecayCurvePoint,
  type LiveHistogramBin,
  type CheckinTokenResponse,
} from '@messpulse/shared';
import type {
  SnapshotRepository,
  SettingsRepository,
  MealRepository,
  SessionStore,
  Clock,
  MessSettingsEntity,
} from './admin.ports';
import { sessionWeight } from '../../core/decay';
import { signMealToken } from '../sessions/meal-token';
import type { EventBus } from '../../infra/event-bus';
import { logger } from '../../infra/logger';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../shared-kernel/errors';

export class AdminService {
  constructor(
    private readonly snapshotRepo: SnapshotRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly mealRepo: MealRepository,
    private readonly sessionStore: SessionStore,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
    private readonly jwtSecret: string
  ) {}

  /**
   * Retrieves historical time series data with server-side downsampling.
   * Throws 422 if range exceeds 31 days or is invalid.
   */
  async getTimeSeries(
    messId: string,
    from: number,
    to: number,
    maxPoints: number = 300
  ): Promise<TimeSeriesPoint[]> {
    if (isNaN(from) || isNaN(to) || from >= to) {
      throw new ValidationError('Invalid time range: from must be less than to', [
        { field: 'range', issue: 'INVALID_RANGE' },
      ]);
    }

    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (to - from > maxRangeMs) {
      throw new ValidationError('Time range cannot exceed 31 days', [
        { field: 'range', issue: 'RANGE_TOO_LARGE' },
      ]);
    }

    const snapshots = await this.snapshotRepo.queryHistory(messId, from, to);

    if (snapshots.length <= maxPoints) {
      return snapshots.map((s) => ({
        ts: s.ts,
        camera: s.cameraCount,
        sessionEstimate: s.sessionEstimate,
        decayWeighted: s.decayWeighted,
        waitMin: s.estWaitMin,
      }));
    }

    // Server-side downsampling using bucket averaging
    const points: TimeSeriesPoint[] = [];
    const bucketSize = Math.ceil(snapshots.length / maxPoints);

    for (let i = 0; i < snapshots.length; i += bucketSize) {
      const chunk = snapshots.slice(i, i + bucketSize);
      if (chunk.length === 0) continue;

      const avgCamera =
        chunk.reduce((acc, c) => acc + c.cameraCount, 0) / chunk.length;
      const avgSession =
        chunk.reduce((acc, c) => acc + c.sessionEstimate, 0) / chunk.length;
      const avgDecay =
        chunk.reduce((acc, c) => acc + c.decayWeighted, 0) / chunk.length;
      const avgWait =
        chunk.reduce((acc, c) => acc + c.estWaitMin, 0) / chunk.length;
      const midTs = Math.round(
        chunk.reduce((acc, c) => acc + c.ts, 0) / chunk.length
      );

      points.push({
        ts: midTs,
        camera: Math.round(avgCamera * 10) / 10,
        sessionEstimate: Math.round(avgSession * 10) / 10,
        decayWeighted: Math.round(avgDecay * 10) / 10,
        waitMin: Math.round(avgWait * 10) / 10,
      });
    }

    return points;
  }

  /**
   * Evaluates the theoretical decay curve and the live weight histogram of active sessions.
   * Reuses core/decay.ts — no formulas duplicated in admin.
   */
  async getDecayCurve(messId: string): Promise<DecayCurveResponse> {
    const settings = await this.settingsRepo.getByMessId(messId);

    const decay: { tail: Array<{ untilOffsetMin: number; weight: number }> } = settings?.decay ?? {
      tail: [
        { untilOffsetMin: 8, weight: 0.6 },
        { untilOffsetMin: 17, weight: 0.25 },
      ],
    };
    const baseMealMin = settings?.baseMealMin ?? 18;
    const maxSessionMin = settings?.maxSessionMin ?? 60;

    // 1. Theoretical curve per minute
    const theoretical: DecayCurvePoint[] = [];
    const checkedInAt = 0;
    const expectedStaySec = baseMealMin * 60;
    const hardExpirySec = Math.min((baseMealMin + 17) * 60, maxSessionMin * 60);

    const theoreticalSession = {
      checkedInAt,
      expectedStaySec,
      hardExpirySec,
    };

    for (let m = 0; m <= maxSessionMin; m++) {
      const t = checkedInAt + m * 60 * 1000;
      const w = sessionWeight(theoreticalSession, t, decay);
      theoretical.push({
        offsetMin: m,
        weight: Math.round(w * 100) / 100,
      });
    }

    // 2. Live weight histogram from active sessions
    const now = this.clock.now();
    const activeMeal = await this.mealRepo.findActiveAt(messId, now);

    const bins: LiveHistogramBin[] = [
      { bin: '0.0 - 0.2', count: 0 },
      { bin: '0.2 - 0.4', count: 0 },
      { bin: '0.4 - 0.6', count: 0 },
      { bin: '0.6 - 0.8', count: 0 },
      { bin: '0.8 - 1.0', count: 0 },
    ];

    if (!activeMeal) {
      return { theoretical, liveHistogram: bins, activeSessions: 0 };
    }

    const sessions = await this.sessionStore.listActive(activeMeal.mealId, now);

    for (const session of sessions) {
      const staySec = Math.max(
        1,
        Math.round((session.expectedStayEndsAt - session.checkedInAt) / 1000)
      );
      const hardSec = Math.max(
        staySec,
        Math.round((session.hardExpiresAt - session.checkedInAt) / 1000)
      );
      const sessionInput = {
        checkedInAt: session.checkedInAt,
        expectedStaySec: staySec,
        hardExpirySec: hardSec,
      };

      const w = sessionWeight(sessionInput, now, decay);

      const targetBin =
        w < 0.2
          ? bins[0]
          : w < 0.4
          ? bins[1]
          : w < 0.6
          ? bins[2]
          : w < 0.8
          ? bins[3]
          : bins[4];
      if (targetBin) {
        targetBin.count++;
      }
    }

    return {
      theoretical,
      liveHistogram: bins,
      activeSessions: sessions.length,
    };
  }

  /**
   * Gets current mess settings as SettingsDTO.
   */
  async getSettings(messId: string): Promise<SettingsDTO> {
    const entity = await this.settingsRepo.getByMessId(messId);
    if (!entity) {
      return SettingsDTOSchema.parse({
        messId,
        capacity: 200,
        servicePerMin: 12,
        demandFactor: 0,
        baseMealMin: 18,
        maxSessionMin: 60,
        staleCameraSec: 30,
        alertCooldownSec: 180,
        updatedAt: 0,
      });
    }

    return this.toSettingsDTO(entity);
  }

  /**
   * Patches mess settings with zod validation, cross-field rules, conflict check, and audit log.
   */
  async updateSettings(
    messId: string,
    rawPatch: unknown,
    expectedUpdatedAt?: number
  ): Promise<SettingsDTO> {
    const parsed = SettingsPatchSchema.safeParse(rawPatch);
    if (!parsed.success) {
      const details = parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      }));
      throw new ValidationError(
        'Validation failed for settings patch',
        details,
        'VALIDATION_ERROR'
      );
    }

    const patch: SettingsPatch = parsed.data;

    // Cross-field validations
    if (
      patch.baseMealMin !== undefined &&
      patch.maxSessionMin !== undefined &&
      patch.maxSessionMin < patch.baseMealMin
    ) {
      throw new ValidationError(
        'maxSessionMin cannot be less than baseMealMin',
        [{ field: 'maxSessionMin', issue: 'MAX_LESS_THAN_BASE' }]
      );
    }

    const current = await this.settingsRepo.getByMessId(messId);

    // Conflict detection (optimistic locking)
    if (expectedUpdatedAt !== undefined && current?.updatedAt) {
      const currentMs = current.updatedAt.getTime();
      if (currentMs !== expectedUpdatedAt) {
        throw new ConflictError(
          'Settings were updated by another administrator. Please refresh.',
          'SETTINGS_CONFLICT'
        );
      }
    }

    const updatedEntity = await this.settingsRepo.upsert({
      messId,
      name: current?.name ?? 'Dining Hall',
      seatCapacity: patch.capacity ?? current?.seatCapacity ?? 200,
      servicePerMin: patch.servicePerMin ?? current?.servicePerMin ?? 12,
      geofence: current?.geofence ?? { lat: 0, lng: 0, radiusM: 100 },
      decay: current?.decay ?? {
        tail: [
          { untilOffsetMin: 8, weight: 0.6 },
          { untilOffsetMin: 17, weight: 0.25 },
        ],
      },
      baseMealMin: patch.baseMealMin ?? current?.baseMealMin ?? 18,
      maxSessionMin: patch.maxSessionMin ?? current?.maxSessionMin ?? 60,
      staleCameraSec: patch.staleCameraSec ?? current?.staleCameraSec ?? 30,
      alertThresholds: {
        ...current?.alertThresholds,
        ...(patch.demandFactor !== undefined
          ? { demandFactor: patch.demandFactor }
          : {}),
        ...(patch.alertCooldownSec !== undefined
          ? { cooldownSec: patch.alertCooldownSec }
          : {}),
      },
    });

    this.eventBus.publish('settings.changed', {
      messId,
      updatedAt: updatedEntity.updatedAt?.getTime() ?? Date.now(),
    });

    logger.info(
      { messId, changedFields: Object.keys(patch) },
      'Mess settings updated by admin'
    );

    return this.toSettingsDTO(updatedEntity);
  }

  /**
   * Produces a signed check-in meal token and QR URL.
   * DOC4 Step 14 gap fix.
   */
  async getCheckinToken(
    mealId: string,
    baseUrl: string = ''
  ): Promise<CheckinTokenResponse> {
    const meal = await this.mealRepo.findByMealId('', mealId);
    if (!meal) {
      throw new NotFoundError(`Meal ${mealId} not found`);
    }

    const now = this.clock.now();
    const remainingSec = Math.max(300, Math.floor((meal.endsAt - now) / 1000));
    const expiresInSec = Math.min(7200, remainingSec);

    const token = signMealToken(
      { messId: meal.messId, mealId: meal.mealId },
      this.jwtSecret,
      expiresInSec
    );

    const cleanBase = baseUrl.replace(/\/$/, '');
    const url = `${cleanBase}/student?token=${token}`;

    return {
      token,
      url,
      expiresAt: now + expiresInSec * 1000,
    };
  }

  private toSettingsDTO(entity: MessSettingsEntity): SettingsDTO {
    const demandFactor =
      typeof entity.alertThresholds?.['demandFactor'] === 'number'
        ? (entity.alertThresholds['demandFactor'] as number)
        : 0;
    const alertCooldownSec =
      typeof entity.alertThresholds?.['cooldownSec'] === 'number'
        ? (entity.alertThresholds['cooldownSec'] as number)
        : 180;

    return SettingsDTOSchema.parse({
      messId: entity.messId,
      capacity: entity.seatCapacity,
      servicePerMin: entity.servicePerMin,
      demandFactor,
      baseMealMin: entity.baseMealMin,
      maxSessionMin: entity.maxSessionMin,
      staleCameraSec: entity.staleCameraSec,
      alertCooldownSec,
      updatedAt: entity.updatedAt ? entity.updatedAt.getTime() : 0,
      ...(entity.enrolledCount !== undefined ? { enrolledCount: entity.enrolledCount } : {}),
      ...(entity.defaultEatRate !== undefined ? { defaultEatRate: entity.defaultEatRate } : {}),
      ...(entity.portionsPerPerson !== undefined ? { portionsPerPerson: entity.portionsPerPerson } : {}),
      ...(entity.safetyMarginPct !== undefined ? { safetyMarginPct: entity.safetyMarginPct } : {}),
      ...(entity.counters !== undefined ? { counters: entity.counters } : {}),
      ...(entity.optOutCutoffMin !== undefined ? { optOutCutoffMin: entity.optOutCutoffMin } : {}),
      ...(entity.ratingDelayMin !== undefined ? { ratingDelayMin: entity.ratingDelayMin } : {}),
      ...(entity.walkToMessMin !== undefined ? { walkToMessMin: entity.walkToMessMin } : {}),
      ...(entity.batchQuality !== undefined ? { batchQuality: entity.batchQuality } : {}),
      ...(entity.unaccounted !== undefined ? { unaccounted: entity.unaccounted } : {}),
      ...(entity.randomAudit !== undefined ? { randomAudit: entity.randomAudit } : {}),
      ...(entity.deviceAnomaly !== undefined ? { deviceAnomaly: entity.deviceAnomaly } : {}),
      ...(entity.rebate !== undefined ? { rebate: entity.rebate } : {}),
      ...(entity.autoCalibrateDemand !== undefined ? { autoCalibrateDemand: entity.autoCalibrateDemand } : {}),
      ...(entity.dpsWeights !== undefined ? { dpsWeights: entity.dpsWeights } : {}),
      ...(entity.imageRetentionDays !== undefined ? { imageRetentionDays: entity.imageRetentionDays } : {}),
    });
  }
}
