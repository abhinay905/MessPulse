/**
 * core/windows.ts — pure window recommendation domain logic.
 * DOC3 §3.3.
 * Pure domain function: no I/O, no framework imports.
 */

import { estimateWaitMin, occupancyLevel, type OccupancyLevel } from './occupancy';

export interface BucketAverage {
  minuteOffset: number;
  avgOccupancy: number;
}

export interface BaselineProfileBucket {
  minuteOffset: number;
  relativeOccupancy: number;
}

export interface BaselineProfile {
  name: string;
  mealType: string;
  buckets: BaselineProfileBucket[];
}

export interface BestWindow {
  startsAt: number;     // epoch ms
  endsAt: number;       // epoch ms
  expectedLevel: OccupancyLevel;
  estWaitMin: number;
}

export interface BestWindowsOptions {
  seatCapacity?: number;
  servicePerMin?: number;
  mealStartMs?: number;
  minHistoryBuckets?: number; // default 3
}

/**
 * Suggests the 3 lowest-occupancy 10-minute arrival windows over the horizon.
 *
 * Rules (DOC3 §3.3):
 * - uses 5-minute buckets of past snapshots for the same weekday + meal type
 * - if fewer than minHistoryBuckets (default 3), falls back to static baseline profile
 * - returns the 3 lowest-occupancy 10-minute windows, sorted chronologically
 */
export function suggestBestWindows(
  history: BucketAverage[],
  profile: BaselineProfile,
  now: number,
  horizonMin = 60,
  options: BestWindowsOptions = {}
): BestWindow[] {
  if (horizonMin < 10) {
    return [];
  }

  const seatCapacity = options.seatCapacity ?? 200;
  const servicePerMin = options.servicePerMin ?? 15;
  const mealStartMs = options.mealStartMs ?? now;
  const minHistory = options.minHistoryBuckets ?? 3;

  const useHistory = history.length >= minHistory;
  const windowCount = Math.floor(horizonMin / 10);

  interface ScoredCandidate {
    window: BestWindow;
    expectedOccupancy: number;
  }

  const candidates: ScoredCandidate[] = [];

  for (let i = 0; i < windowCount; i++) {
    const windowStartMs = now + i * 10 * 60 * 1000;
    const windowEndMs = windowStartMs + 10 * 60 * 1000;

    // midpoint offset in minutes relative to mealStartMs
    const midPointMs = windowStartMs + 5 * 60 * 1000;
    const offsetMin = Math.max(0, (midPointMs - mealStartMs) / (60 * 1000));

    let expectedOccupancy: number;
    if (useHistory) {
      expectedOccupancy = interpolateFromHistory(history, offsetMin);
    } else {
      expectedOccupancy = interpolateFromProfile(profile, offsetMin, seatCapacity);
    }

    const expectedLevel = occupancyLevel(expectedOccupancy, seatCapacity);
    const estWaitMin = estimateWaitMin({
      occupancy: expectedOccupancy,
      seatCapacity,
      servicePerMin,
    });

    candidates.push({
      window: {
        startsAt: windowStartMs,
        endsAt: windowEndMs,
        expectedLevel,
        estWaitMin,
      },
      expectedOccupancy,
    });
  }

  // Sort by lowest expected occupancy first to find best windows
  candidates.sort((a, b) => a.expectedOccupancy - b.expectedOccupancy);

  // Pick up to 3 best windows
  const selected = candidates.slice(0, 3).map((c) => c.window);

  // Return them sorted chronologically by start time
  selected.sort((a, b) => a.startsAt - b.startsAt);

  return selected;
}

export function interpolateFromHistory(history: BucketAverage[], offsetMin: number): number {
  const first = history[0];
  if (!first) {
    return 0;
  }
  let closest = first;
  let minDiff = Math.abs(offsetMin - closest.minuteOffset);
  for (let i = 1; i < history.length; i++) {
    const item = history[i];
    if (item) {
      const diff = Math.abs(offsetMin - item.minuteOffset);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
  }
  return closest.avgOccupancy;
}

export function interpolateFromProfile(
  profile: BaselineProfile,
  offsetMin: number,
  capacity: number
): number {
  const first = profile.buckets[0];
  if (!first) {
    return 0;
  }
  let closest = first;
  let minDiff = Math.abs(offsetMin - closest.minuteOffset);
  for (let i = 1; i < profile.buckets.length; i++) {
    const item = profile.buckets[i];
    if (item) {
      const diff = Math.abs(offsetMin - item.minuteOffset);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
  }
  return Math.round(closest.relativeOccupancy * capacity);
}
