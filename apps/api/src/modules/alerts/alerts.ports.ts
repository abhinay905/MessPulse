/**
 * modules/alerts/alerts.ports.ts — Alert ports and evaluation context.
 * DOC3 §3.6.
 */

import type {
  AlertEntity,
  AlertRepository,
  MealEntity,
  MealRepository,
  EntryVelocityStore,
  CameraReadingStore,
  MessSettingsEntity,
  SettingsRepository,
  Clock,
} from '../../core/ports';

export type {
  AlertEntity,
  AlertRepository,
  MealEntity,
  MealRepository,
  EntryVelocityStore,
  CameraReadingStore,
  MessSettingsEntity,
  SettingsRepository,
  Clock,
};

export interface RuleContext {
  messId: string;
  mealId: string;
  now: number;
  meal: MealEntity;
  settings: MessSettingsEntity;
  velocityPerMin: number;
  enteredSoFar: number;
  openAlert: AlertEntity | null;
}
