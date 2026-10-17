/**
 * modules/occupancy/occupancy.ports.ts — ports and types for Occupancy module.
 * DOC3 §3.3, §3.5.
 */

import type { StatusSnapshot } from '@messpulse/shared';
import type {
  CameraReadingStore,
  SessionStore,
  MealRepository,
  SettingsRepository,
  SnapshotRepository,
  Clock,
} from '../../core/ports';
import type { EventBus } from '../../infra/event-bus';

export type {
  StatusSnapshot,
  CameraReadingStore,
  SessionStore,
  MealRepository,
  SettingsRepository,
  SnapshotRepository,
  Clock,
  EventBus,
};
