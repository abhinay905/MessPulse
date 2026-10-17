/**
 * modules/optouts/optouts.ports.ts — Ports consumed by the OptOut module.
 * DOC3 §3.12, DOC3 §3.13.
 */

export type {
  OptOutRepository,
  MealRepository,
  SettingsRepository,
  OptOutEntity,
  MealEntity,
  MessSettingsEntity,
} from '../../core/ports';
export type { Clock } from '../../infra/clock';
export type { EventBus } from '../../infra/event-bus';
