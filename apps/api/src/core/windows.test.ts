import { describe, expect, it } from 'vitest';
import baselineProfileJson from './baseline-profile.json';
import {
  interpolateFromHistory,
  interpolateFromProfile,
  suggestBestWindows,
  type BaselineProfile,
  type BucketAverage,
} from './windows';

describe('suggestBestWindows', () => {
  const profile: BaselineProfile = baselineProfileJson as BaselineProfile;
  const now = 1_700_000_000_000; // epoch ms

  it('returns empty array when horizonMin < 10', () => {
    const result = suggestBestWindows([], profile, now, 5);
    expect(result).toEqual([]);
  });

  it('falls back to baseline profile when history has fewer than 3 buckets', () => {
    const insufficientHistory: BucketAverage[] = [
      { minuteOffset: 0, avgOccupancy: 30 },
      { minuteOffset: 5, avgOccupancy: 50 },
    ];

    const windows = suggestBestWindows(insufficientHistory, profile, now, 60, {
      seatCapacity: 200,
      servicePerMin: 15,
      minHistoryBuckets: 3,
    });

    expect(windows.length).toBe(3);
    const w0 = windows[0];
    const w1 = windows[1];
    const w2 = windows[2];
    expect(w0).toBeDefined();
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    if (w0 && w1 && w2) {
      expect(w0.startsAt).toBeLessThan(w1.startsAt);
      expect(w1.startsAt).toBeLessThan(w2.startsAt);
    }

    // Each window is 10 minutes (600,000 ms)
    for (const w of windows) {
      expect(w.endsAt - w.startsAt).toBe(10 * 60 * 1000);
      expect(['low', 'medium', 'high']).toContain(w.expectedLevel);
      expect(w.estWaitMin).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses history when history has >= 3 buckets', () => {
    // History where minute 0-10 has occupancy 10, minute 20-30 has occupancy 180, minute 50-60 has occupancy 20
    const history: BucketAverage[] = [
      { minuteOffset: 0, avgOccupancy: 20 },
      { minuteOffset: 10, avgOccupancy: 30 },
      { minuteOffset: 20, avgOccupancy: 190 },
      { minuteOffset: 30, avgOccupancy: 180 },
      { minuteOffset: 40, avgOccupancy: 120 },
      { minuteOffset: 50, avgOccupancy: 15 },
    ];

    const windows = suggestBestWindows(history, profile, now, 60, {
      seatCapacity: 200,
      servicePerMin: 15,
      mealStartMs: now,
    });

    expect(windows.length).toBe(3);

    // Lowest windows should correspond to low occupancy buckets (e.g. 0-10m, 10-20m, 50-60m)
    // and NOT 20-30m or 30-40m peak
    const peakStart = now + 20 * 60 * 1000;
    const peakWindow = windows.find((w) => w.startsAt === peakStart);
    expect(peakWindow).toBeUndefined(); // high occupancy peak should not be recommended
  });

  it('handles empty profile and empty history gracefully without throwing', () => {
    const emptyProfile: BaselineProfile = {
      name: 'empty',
      mealType: 'lunch',
      buckets: [],
    };
    const windows = suggestBestWindows([], emptyProfile, now, 30);
    expect(windows.length).toBe(3);
    const w0 = windows[0];
    expect(w0).toBeDefined();
    if (w0) {
      expect(w0.expectedLevel).toBe('low');
      expect(w0.estWaitMin).toBe(0);
    }
  });

  describe('interpolation helpers', () => {
    it('interpolateFromHistory returns 0 for empty history', () => {
      expect(interpolateFromHistory([], 10)).toBe(0);
    });

    it('interpolateFromProfile returns 0 for empty profile buckets', () => {
      expect(interpolateFromProfile({ name: 'empty', mealType: 'lunch', buckets: [] }, 10, 200)).toBe(0);
    });
  });
});
