/**
 * modules/alerts/alerts.service.ts — Alert lifecycle service.
 * DOC3 §3.6.
 *
 * Coordinates:
 * - AlertEngine evaluation on ticks
 * - Open alert deduplication per (ruleId, mealId)
 * - 3-minute cooldown preventing re-raise after clear
 * - Hysteresis clear
 * - Realtime publication via EventBus
 * - Staff acknowledgment (ack) and tray capacity updates
 */

import type { AlertDTO } from '@messpulse/shared';
import type { AlertEngine } from './alert-engine';
import type {
  AlertEntity,
  AlertRepository,
  MealRepository,
  EntryVelocityStore,
  CameraReadingStore,
  SettingsRepository,
  MessSettingsEntity,
  Clock,
  RuleContext,
} from './alerts.ports';
import type { EventBus } from '../../infra/event-bus';
import { logger } from '../../infra/logger';
import { NotFoundError, ValidationError } from '../../shared-kernel/errors';

export class AlertService {
  private readonly lastClearedAt = new Map<string, number>();

  constructor(
    private readonly alertEngine: AlertEngine,
    private readonly alertRepo: AlertRepository,
    private readonly mealRepo: MealRepository,
    private readonly velocityStore: EntryVelocityStore,
    private readonly cameraStore: CameraReadingStore,
    private readonly settingsRepo: SettingsRepository,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
    private readonly defaultMessId = 'mess-default'
  ) {}

  /**
   * Main periodic evaluation loop (DOC3 §3.6).
   * Called on every 1-second tick by the scheduler.
   */
  async handleTick(now = this.clock.now(), messId = this.defaultMessId): Promise<void> {
    const activeMeal = await this.mealRepo.findActiveAt(messId, now);

    // If no meal is active, clear any open alerts (meal_ended)
    if (!activeMeal) {
      const openAlerts = await this.alertRepo.list(messId, { openOnly: true });
      for (const openAlert of openAlerts) {
        if (!openAlert.id) continue;
        await this.alertRepo.clear(openAlert.id, now);
        this.eventBus.publish('alert.cleared', {
          id: openAlert.id,
          mealId: openAlert.mealId,
          ruleId: openAlert.ruleId,
          clearedAt: now,
        });
      }
      return;
    }

    const mealId = activeMeal.mealId;
    const defaultSettings: MessSettingsEntity = {
      messId,
      name: 'Dining Hall',
      seatCapacity: 200,
      servicePerMin: 12,
      geofence: { lat: 0, lng: 0, radiusM: 100 },
      decay: { tail: [] },
      baseMealMin: 18,
      maxSessionMin: 60,
      staleCameraSec: 30,
      alertThresholds: { cooldownSec: 180 },
    };
    const settings = (await this.settingsRepo.getByMessId(messId)) || defaultSettings;

    // 1. Gather velocity & camera count
    const windowStart = now - 5 * 60 * 1000;
    const entryCountLast5Min = await this.velocityStore.countSince(mealId, windowStart);
    const velocityPerMin = entryCountLast5Min / 5;

    const latestReading = await this.cameraStore.getLatest(mealId);
    const enteredSoFar = latestReading?.inCount ?? 0;

    // 2. Evaluate all rules
    const cooldownSec =
      typeof settings.alertThresholds?.['cooldownSec'] === 'number'
        ? (settings.alertThresholds['cooldownSec'] as number)
        : 180;
    const rules = this.alertEngine.getRules();

    for (const rule of rules) {
      const openAlert = await this.alertRepo.findOpen(messId, mealId, rule.id);
      const ctx: RuleContext = {
        messId,
        mealId,
        now,
        meal: activeMeal,
        settings,
        velocityPerMin,
        enteredSoFar,
        openAlert,
      };

      const results = await this.alertEngine.evaluate(ctx);
      const ruleResult = results.find((r) => r.ruleId === rule.id);
      if (!ruleResult) continue;

      const outcome = ruleResult.outcome;

      if (outcome.action === 'raise') {
        // Dedupe: do not raise if already open
        if (openAlert) {
          continue;
        }

        // Cooldown check (3 min = 180 s)
        const key = `${messId}:${mealId}:${rule.id}`;
        const lastCleared = this.lastClearedAt.get(key) ?? 0;
        if (now - lastCleared < cooldownSec * 1000) {
          continue;
        }

        const alertPayload: Omit<AlertEntity, 'id' | 'createdAt' | 'updatedAt'> = {
          messId,
          mealId,
          ruleId: rule.id,
          severity: outcome.severity || 'warning',
          payload: {
            message: outcome.message || `${rule.id} alert`,
            ...(outcome.payload || {}),
          },
          raisedAt: now,
        };

        let createdAlert: AlertEntity | null = null;
        try {
          createdAlert = await this.alertRepo.create(alertPayload);
        } catch (err) {
          logger.error({ err, ruleId: rule.id }, 'Alert persistence failed; emitting realtime alert for safety');
        }

        const alertDto: AlertDTO = {
          id: createdAlert?.id || `fallback-${now}`,
          ruleId: rule.id,
          mealId,
          severity: outcome.severity || 'warning',
          message: outcome.message || `${rule.id} alert`,
          raisedAt: now,
        };

        this.eventBus.publish('alert.raised', alertDto);
      } else if (outcome.action === 'clear') {
        if (openAlert && openAlert.id) {
          await this.alertRepo.clear(openAlert.id, now);
          const key = `${messId}:${mealId}:${rule.id}`;
          this.lastClearedAt.set(key, now);

          this.eventBus.publish('alert.cleared', {
            id: openAlert.id,
            mealId,
            ruleId: rule.id,
            clearedAt: now,
          });
        }
      }
    }
  }

  /**
   * Lists alerts for staff/admin dashboard.
   */
  async listAlerts(messId = this.defaultMessId, openOnly = false): Promise<AlertDTO[]> {
    const entities = await this.alertRepo.list(messId, { openOnly });
    return entities.map((e) => ({
      id: e.id || '',
      ruleId: e.ruleId,
      mealId: e.mealId,
      severity: e.severity,
      message: (e.payload['message'] as string) || `${e.ruleId} alert`,
      raisedAt: e.raisedAt,
      ackedAt: e.ackedAt,
      clearedAt: e.clearedAt,
    }));
  }

  /**
   * Staff acknowledges an alert.
   * Does NOT clear the alert; only records who acked and when.
   */
  async ackAlert(alertId: string, ackedBy: string, now = this.clock.now()): Promise<AlertDTO> {
    const updated = await this.alertRepo.ack(alertId, ackedBy, now);
    if (!updated) {
      throw new NotFoundError(`Alert ${alertId} not found`);
    }

    return {
      id: updated.id || alertId,
      ruleId: updated.ruleId,
      mealId: updated.mealId,
      severity: updated.severity,
      message: (updated.payload['message'] as string) || `${updated.ruleId} alert`,
      raisedAt: updated.raisedAt,
      ackedAt: updated.ackedAt,
      clearedAt: updated.clearedAt,
    };
  }

  /**
   * Updates tray capacity portions for active/given meal.
   * DOC3 §3.6: Invalid capacity (<= 0, non-integer, > 10,000) -> 422 VALIDATION_ERROR.
   * Raising capacity naturally clears depletion alert on the next tick.
   */
  async updateTrayCapacity(
    mealId: string,
    capacityPortions: number,
    messId = this.defaultMessId
  ): Promise<{ mealId: string; capacityPortions: number }> {
    if (
      !Number.isInteger(capacityPortions) ||
      capacityPortions <= 0 ||
      capacityPortions > 10_000
    ) {
      throw new ValidationError(
        'Tray capacity must be an integer between 1 and 10,000 portions'
      );
    }

    const updated = await this.mealRepo.updateTrayCapacity(messId, mealId, capacityPortions);
    if (!updated) {
      throw new NotFoundError(`Meal ${mealId} not found`);
    }

    // Immediately trigger tick to evaluate hysteresis clear if capacity was refilled
    await this.handleTick(this.clock.now(), messId);

    return {
      mealId: updated.mealId,
      capacityPortions,
    };
  }
}
