/**
 * modules/optouts/optouts.service.ts — Service for student advance opt-out ("Skipping Today").
 * DOC3 §3.12, DOC3 §3.13, DOC4 Step 17.
 */

import type { OptOutResponse } from '@messpulse/shared';
import type {
  OptOutRepository,
  MealRepository,
  SettingsRepository,
  Clock,
  EventBus,
} from './optouts.ports';
import { isOptOutWindowOpen, computeOptOutCutoffAt } from '../../core/optout';
import { ValidationError, NotFoundError } from '../../shared-kernel/errors';

export class OptOutService {
  constructor(
    private readonly optOutRepo: OptOutRepository,
    private readonly mealRepo: MealRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
    private readonly defaultMessId: string
  ) {}

  async set(userId: string, mealId: string, messId = this.defaultMessId): Promise<OptOutResponse> {
    const trimmedUserId = userId.trim();
    const trimmedMealId = mealId.trim();
    const now = this.clock.now();

    const meal = await this.mealRepo.findByMealId(messId, trimmedMealId);
    if (!meal) {
      throw new NotFoundError(`Meal not found: ${trimmedMealId}`);
    }

    const settings = await this.settingsRepo.getByMessId(messId);
    const cutoffMin = settings?.optOutCutoffMin ?? 60;

    if (!isOptOutWindowOpen(meal.startsAt, cutoffMin, now)) {
      throw new ValidationError(
        'Opt-out window is closed for this meal',
        { mealId: trimmedMealId, cutoffAt: computeOptOutCutoffAt(meal.startsAt, cutoffMin), now },
        'OPTOUT_WINDOW_CLOSED'
      );
    }

    await this.optOutRepo.upsert(trimmedUserId, trimmedMealId);
    this.eventBus.publish('optout.changed', {
      messId,
      mealId: trimmedMealId,
      userId: trimmedUserId,
      optedOut: true,
      at: now,
    });

    return {
      optedOut: true,
      cutoffAt: computeOptOutCutoffAt(meal.startsAt, cutoffMin),
    };
  }

  async remove(userId: string, mealId: string, messId = this.defaultMessId): Promise<void> {
    const trimmedUserId = userId.trim();
    const trimmedMealId = mealId.trim();
    const now = this.clock.now();

    const meal = await this.mealRepo.findByMealId(messId, trimmedMealId);
    if (!meal) {
      throw new NotFoundError(`Meal not found: ${trimmedMealId}`);
    }

    const settings = await this.settingsRepo.getByMessId(messId);
    const cutoffMin = settings?.optOutCutoffMin ?? 60;

    if (!isOptOutWindowOpen(meal.startsAt, cutoffMin, now)) {
      throw new ValidationError(
        'Opt-out window is closed for this meal',
        { mealId: trimmedMealId, cutoffAt: computeOptOutCutoffAt(meal.startsAt, cutoffMin), now },
        'OPTOUT_WINDOW_CLOSED'
      );
    }

    await this.optOutRepo.remove(trimmedUserId, trimmedMealId);
    this.eventBus.publish('optout.changed', {
      messId,
      mealId: trimmedMealId,
      userId: trimmedUserId,
      optedOut: false,
      at: now,
    });
  }

  async getMine(userId: string, mealId: string, messId = this.defaultMessId): Promise<OptOutResponse> {
    const trimmedUserId = userId.trim();
    const trimmedMealId = mealId.trim();

    const meal = await this.mealRepo.findByMealId(messId, trimmedMealId);
    if (!meal) {
      throw new NotFoundError(`Meal not found: ${trimmedMealId}`);
    }

    const settings = await this.settingsRepo.getByMessId(messId);
    const cutoffMin = settings?.optOutCutoffMin ?? 60;

    const record = await this.optOutRepo.findByUserMeal(trimmedUserId, trimmedMealId);

    return {
      optedOut: Boolean(record),
      cutoffAt: computeOptOutCutoffAt(meal.startsAt, cutoffMin),
    };
  }

  async countForMeal(mealId: string): Promise<number> {
    return this.optOutRepo.countByMeal(mealId.trim());
  }
}
