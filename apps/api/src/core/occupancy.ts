/**
 * core/occupancy.ts — pure occupancy estimation, level calculation, wait time and calibration.
 * DOC3 §3.3, §3.5.
 * Pure domain functions: no I/O, no framework imports.
 */

import type { CameraReading } from './ports';

export type OccupancyLevel = 'low' | 'medium' | 'high';

/**
 * Estimates wait time in minutes given current occupancy, seat capacity, and service rate.
 *
 * queued = max(0, occupancy − seatCapacity)
 * wait = ceil(queued / servicePerMin)
 * servicePerMin <= 0 is treated as unknown/unserviceable (returns 0).
 */
export function estimateWaitMin(input: {
  occupancy: number;
  seatCapacity: number;
  servicePerMin: number;
}): number {
  if (input.servicePerMin <= 0) {
    return 0;
  }
  const queued = Math.max(0, input.occupancy - input.seatCapacity);
  if (queued === 0) {
    return 0;
  }
  return Math.ceil(queued / input.servicePerMin);
}

/**
 * Returns honest uncertainty range [floor(0.8 * w), ceil(1.2 * w)].
 */
export function waitRange(waitMin: number): [number, number] {
  if (waitMin <= 0) {
    return [0, 0];
  }
  return [Math.floor(0.8 * waitMin), Math.ceil(1.2 * waitMin)];
}

/**
 * Maps occupancy value / capacity ratio to level 'low' | 'medium' | 'high'.
 * Default thresholds: < 0.5 low, < 0.8 medium, else high.
 * capacity <= 0 or value <= 0 defaults to 'low' (avoids divide-by-zero).
 */
export function occupancyLevel(
  value: number,
  capacity: number,
  thresholds: { lowMax?: number; mediumMax?: number } = {}
): OccupancyLevel {
  if (capacity <= 0 || value <= 0) {
    return 'low';
  }
  const lowMax = thresholds.lowMax ?? 0.5;
  const mediumMax = thresholds.mediumMax ?? 0.8;
  const ratio = value / capacity;

  if (ratio < lowMax) {
    return 'low';
  }
  if (ratio < mediumMax) {
    return 'medium';
  }
  return 'high';
}

/**
 * Exponential moving average for wait-time jitter control.
 */
export function smoothEma(prev: number | null, next: number, alpha = 0.3): number {
  if (prev === null) {
    return next;
  }
  return Number((alpha * next + (1 - alpha) * prev).toFixed(2));
}

export interface SelectOccupancyInput {
  camera: CameraReading | null;
  cameraBaseline: number;
  decayWeighted: number;
  lastRatio: number | null;
  now: number;
  staleCameraSec: number;
}

export interface SelectOccupancyResult {
  value: number;
  source: 'camera' | 'sessions';
  stale: boolean;
  ratio: number | null;
}

/**
 * Selects occupancy estimate between camera and decay-weighted sessions.
 *
 * Rules (DOC3 §3.5):
 * - camera is fresh if present and (now - camera.receivedAt) / 1000 <= staleCameraSec
 * - fresh camera:
 *     value = max(0, camera.count - baseline)
 *     source = 'camera'
 *     ratio = clamp(value / max(decayWeighted, 1), 1, 10)
 *     stale = false
 * - stale/missing camera:
 *     effectiveRatio = lastRatio ?? 1
 *     value = round(decayWeighted * effectiveRatio)
 *     source = 'sessions'
 *     stale = true
 *     ratio = lastRatio
 */
export function selectOccupancy(input: SelectOccupancyInput): SelectOccupancyResult {
  const isFresh =
    input.camera !== null &&
    (input.now - input.camera.receivedAt) / 1000 <= input.staleCameraSec;

  if (isFresh && input.camera !== null) {
    const value = Math.max(0, input.camera.count - input.cameraBaseline);
    const rawRatio = value / Math.max(input.decayWeighted, 1);
    const ratio = Math.min(10, Math.max(1, rawRatio));

    return {
      value,
      source: 'camera',
      stale: false,
      ratio: Number(ratio.toFixed(2)),
    };
  }

  const effectiveRatio = input.lastRatio ?? 1;
  const value = Math.round(input.decayWeighted * effectiveRatio);

  return {
    value,
    source: 'sessions',
    stale: true,
    ratio: input.lastRatio,
  };
}

/**
 * Updates calibration ratio EMA, clamped to [1, 10].
 */
export function calibrationRatio(prev: number | null, observed: number, alpha = 0.2): number {
  const clampedObserved = Math.min(10, Math.max(1, observed));
  if (prev === null) {
    return Number(clampedObserved.toFixed(2));
  }
  const updated = alpha * clampedObserved + (1 - alpha) * prev;
  const clamped = Math.min(10, Math.max(1, updated));
  return Number(clamped.toFixed(2));
}
