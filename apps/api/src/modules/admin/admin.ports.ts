/**
 * modules/admin/admin.ports.ts — Port interfaces for Admin module.
 * DOC3 §3.7.
 */

import type {
  OccupancySnapshotEntity,
  SnapshotRepository,
  MessSettingsEntity,
  SettingsRepository,
  MealEntity,
  MealRepository,
  SessionStore,
  ActiveSession,
} from '../../core/ports';
import type { Clock } from '../../infra/clock';

export type {
  OccupancySnapshotEntity,
  SnapshotRepository,
  MessSettingsEntity,
  SettingsRepository,
  MealEntity,
  MealRepository,
  SessionStore,
  ActiveSession,
  Clock,
};
