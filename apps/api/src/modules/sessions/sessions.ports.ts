/**
 * modules/sessions/sessions.ports.ts — port interfaces needed by SessionService.
 * DOC3 §3.4.
 *
 * Sessions does not import OccupancyService directly; it receives QueueWaitProvider.
 */

import type {
  ActiveSession,
  CheckInEntity,
  CheckInRepository,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  SessionStore,
  SettingsRepository,
} from '../../core/ports';

export type {
  ActiveSession,
  CheckInEntity,
  CheckInRepository,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  SessionStore,
  SettingsRepository,
};

export interface QueueWaitProvider {
  /**
   * Returns current estimated wait time in seconds for the given meal.
   * If mess is not queued or meal is not open, returns 0.
   */
  getEstimatedWaitSec(mealId: string): Promise<number>;
}
