/**
 * modules/ingest/ingest.ports.ts — ports and result shapes for ingest module.
 * DOC3 §3.2.
 */

import type { LiveCountPayload } from '@messpulse/shared';
import type { CameraReadingStore, EntryVelocityStore, MealRepository, Clock } from '../../core/ports';
import type { EventBus } from '../../infra/event-bus';

export interface IngestResult {
  accepted: boolean;
  ignored?: boolean | undefined;
}

export type { LiveCountPayload, CameraReadingStore, EntryVelocityStore, MealRepository, Clock, EventBus };
