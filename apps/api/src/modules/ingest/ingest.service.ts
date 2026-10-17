/**
 * modules/ingest/ingest.service.ts — Live head-count ingestion service.
 * DOC3 §3.2, DOC4 Step 7.
 * Single responsibility: reliable ingestion and velocity recording.
 * No occupancy math, no socket calls, no Mongo writes on the hot path.
 */

import type { LiveCountPayload, IngestResult } from './ingest.ports';
import type { CameraReadingStore, EntryVelocityStore, MealRepository, CameraReading } from '../../core/ports';
import type { EventBus } from '../../infra/event-bus';
import { logger } from '../../infra/logger';

export class IngestService {
  constructor(
    private readonly cameraStore: CameraReadingStore,
    private readonly velocityStore: EntryVelocityStore,
    private readonly mealRepo: MealRepository,
    private readonly eventBus: EventBus
  ) {}

  async recordReading(payload: LiveCountPayload, now: number): Promise<IngestResult> {
    // 1. Look up active or upcoming meal for messId (null => store as off-hours)
    const meal = await this.mealRepo.findActiveOrUpcoming(payload.messId, now);
    const mealId = meal ? meal.mealId : null;
    const storeKey = mealId ?? `${payload.messId}:off-hours`;

    // 2. Sequence check: reject duplicate or older seq
    const latest = await this.cameraStore.getLatest(storeKey);
    if (latest && payload.seq <= latest.seq) {
      return { accepted: true, ignored: true };
    }

    // 3. Baseline capture: on the first reading inside [startsAt - 5 min ... startsAt + 2 min]
    let cameraBaseline = latest?.cameraBaseline;
    if (meal && cameraBaseline === undefined) {
      const baselineWindowStart = meal.startsAt - 5 * 60 * 1000;
      const baselineWindowEnd = meal.startsAt + 2 * 60 * 1000;
      if (now >= baselineWindowStart && now <= baselineWindowEnd) {
        cameraBaseline = payload.count;
      }
    }

    // 4. Compute inDelta & handle counter resets (e.g. script restart mid-run)
    let inDelta = 0;
    if (latest) {
      if (payload.inCount < latest.inCount) {
        // Counter reset mid-run
        inDelta = payload.inCount;
      } else {
        inDelta = Math.max(0, payload.inCount - latest.inCount);
      }
    } else {
      inDelta = payload.inCount;
    }

    // 5. If meal active and inDelta > 0, record entry velocity in Redis
    if (mealId && inDelta > 0) {
      const eventId = `${payload.messId}:${payload.seq}:${now}`;
      await this.velocityStore.record(mealId, eventId, now, inDelta);
    }

    // 6. Save latest camera reading
    const reading: CameraReading = {
      seq: payload.seq,
      count: payload.count,
      inCount: payload.inCount,
      outCount: payload.outCount,
      capturedAt: payload.capturedAt,
      receivedAt: now,
      cameraBaseline,
    };
    await this.cameraStore.saveLatest(storeKey, reading);

    // Implausible jump detection (|Δcount| > 150)
    if (latest && Math.abs(payload.count - latest.count) > 150) {
      logger.warn(
        { messId: payload.messId, prevCount: latest.count, newCount: payload.count, seq: payload.seq },
        'Implausible camera count jump detected'
      );
    }

    // 7. Publish internal event
    this.eventBus.publish('reading.recorded', {
      messId: payload.messId,
      mealId,
      seq: payload.seq,
      count: payload.count,
      inCountDelta: inDelta,
    });

    return { accepted: true };
  }
}
