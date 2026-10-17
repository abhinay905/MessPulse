/**
 * infra/memory/camera-reading-store.memory.ts — in-memory implementation of CameraReadingStore.
 */

import type { CameraReading, CameraReadingStore } from '../../core/ports';

export class InMemoryCameraReadingStore implements CameraReadingStore {
  private readonly readings = new Map<string, CameraReading>();

  async saveLatest(mealId: string, reading: CameraReading): Promise<void> {
    this.readings.set(mealId, { ...reading });
  }

  async getLatest(mealId: string): Promise<CameraReading | null> {
    const reading = this.readings.get(mealId);
    return reading ? { ...reading } : null;
  }
}
