import { describe, expect, it } from 'vitest';
import {
  calibrationRatio,
  estimateWaitMin,
  occupancyLevel,
  selectOccupancy,
  smoothEma,
  waitRange,
  type SelectOccupancyInput,
} from './occupancy';
import type { CameraReading } from './ports';

describe('occupancy domain functions', () => {
  describe('estimateWaitMin', () => {
    it.each<[string, { occupancy: number; seatCapacity: number; servicePerMin: number }, number]>([
      ['below capacity -> wait is 0', { occupancy: 150, seatCapacity: 200, servicePerMin: 15 }, 0],
      ['exact capacity -> wait is 0', { occupancy: 200, seatCapacity: 200, servicePerMin: 15 }, 0],
      ['overflow -> queued = 50, serviceRate = 10 -> ceil(50/10) = 5 min', { occupancy: 250, seatCapacity: 200, servicePerMin: 10 }, 5],
      ['overflow with non-integer division -> queued = 11, serviceRate = 10 -> ceil(1.1) = 2 min', { occupancy: 211, seatCapacity: 200, servicePerMin: 10 }, 2],
      ['zero service rate -> returns 0 (handles unknown/unserviceable)', { occupancy: 250, seatCapacity: 200, servicePerMin: 0 }, 0],
      ['negative service rate -> returns 0', { occupancy: 250, seatCapacity: 200, servicePerMin: -5 }, 0],
    ])('%s', (_name, input, expected) => {
      expect(estimateWaitMin(input)).toBe(expected);
    });
  });

  describe('waitRange', () => {
    it.each<[number, [number, number]]>([
      [0, [0, 0]],
      [-5, [0, 0]],
      [10, [8, 12]], // floor(8), ceil(12)
      [15, [12, 18]], // floor(12), ceil(18)
      [7, [5, 9]], // floor(5.6) = 5, ceil(8.4) = 9
    ])('waitMin: %d -> %j', (waitMin, expected) => {
      expect(waitRange(waitMin)).toEqual(expected);
    });
  });

  describe('occupancyLevel', () => {
    it.each<[string, number, number, 'low' | 'medium' | 'high']>([
      ['zero occupancy -> low', 0, 200, 'low'],
      ['negative occupancy -> low', -10, 200, 'low'],
      ['zero capacity -> low (no divide-by-zero)', 50, 0, 'low'],
      ['negative capacity -> low', 50, -100, 'low'],
      ['below 50% (49.5%) -> low', 99, 200, 'low'],
      ['exactly 50.0% -> medium', 100, 200, 'medium'],
      ['between 50% and 80% (60%) -> medium', 120, 200, 'medium'],
      ['just below 80% (79.5%) -> medium', 159, 200, 'medium'],
      ['exactly 80.0% -> high', 160, 200, 'high'],
      ['overflow (125%) -> high', 250, 200, 'high'],
    ])('%s', (_name, value, capacity, expected) => {
      expect(occupancyLevel(value, capacity)).toBe(expected);
    });

    it('supports custom thresholds', () => {
      expect(occupancyLevel(40, 100, { lowMax: 0.3, mediumMax: 0.7 })).toBe('medium');
      expect(occupancyLevel(25, 100, { lowMax: 0.3, mediumMax: 0.7 })).toBe('low');
      expect(occupancyLevel(75, 100, { lowMax: 0.3, mediumMax: 0.7 })).toBe('high');
    });
  });

  describe('smoothEma', () => {
    it('returns next when prev is null', () => {
      expect(smoothEma(null, 15)).toBe(15);
    });

    it('calculates weighted EMA when prev is present', () => {
      // 0.3 * 20 + 0.7 * 10 = 6 + 7 = 13
      expect(smoothEma(10, 20, 0.3)).toBe(13);
      // default alpha = 0.3
      expect(smoothEma(10, 20)).toBe(13);
    });
  });

  describe('selectOccupancy', () => {
    const now = 1_000_000; // ms
    const staleCameraSec = 30;

    const createCamera = (receivedOffsetSec: number, count = 120): CameraReading => ({
      seq: 1,
      count,
      inCount: 200,
      outCount: 80,
      capturedAt: now - receivedOffsetSec * 1000 - 50,
      receivedAt: now - receivedOffsetSec * 1000,
    });

    it('fresh camera at 29 s staleness -> source camera, stale false', () => {
      const input: SelectOccupancyInput = {
        camera: createCamera(29, 100),
        cameraBaseline: 10,
        decayWeighted: 50,
        lastRatio: 2.0,
        now,
        staleCameraSec,
      };
      const result = selectOccupancy(input);
      expect(result.source).toBe('camera');
      expect(result.stale).toBe(false);
      expect(result.value).toBe(90); // 100 - baseline 10
      expect(result.ratio).toBe(1.8); // 90 / 50 = 1.8
    });

    it('fresh camera at 30 s staleness (boundary) -> source camera, stale false', () => {
      const input: SelectOccupancyInput = {
        camera: createCamera(30, 150),
        cameraBaseline: 20,
        decayWeighted: 65,
        lastRatio: null,
        now,
        staleCameraSec,
      };
      const result = selectOccupancy(input);
      expect(result.source).toBe('camera');
      expect(result.stale).toBe(false);
      expect(result.value).toBe(130); // 150 - 20
      expect(result.ratio).toBe(2.0); // 130 / 65 = 2.0
    });

    it('stale camera at 31 s staleness (boundary) -> source sessions, stale true', () => {
      const input: SelectOccupancyInput = {
        camera: createCamera(31, 150),
        cameraBaseline: 20,
        decayWeighted: 40,
        lastRatio: 2.5,
        now,
        staleCameraSec,
      };
      const result = selectOccupancy(input);
      expect(result.source).toBe('sessions');
      expect(result.stale).toBe(true);
      expect(result.value).toBe(100); // round(40 * 2.5)
      expect(result.ratio).toBe(2.5);
    });

    it('null camera -> source sessions, stale true, default ratio 1 when lastRatio is null', () => {
      const input: SelectOccupancyInput = {
        camera: null,
        cameraBaseline: 0,
        decayWeighted: 45,
        lastRatio: null,
        now,
        staleCameraSec,
      };
      const result = selectOccupancy(input);
      expect(result.source).toBe('sessions');
      expect(result.stale).toBe(true);
      expect(result.value).toBe(45); // 45 * 1
      expect(result.ratio).toBeNull();
    });

    it('clamps camera value at zero if count is below baseline', () => {
      const input: SelectOccupancyInput = {
        camera: createCamera(10, 5),
        cameraBaseline: 20,
        decayWeighted: 30,
        lastRatio: 1.0,
        now,
        staleCameraSec,
      };
      const result = selectOccupancy(input);
      expect(result.value).toBe(0);
      expect(result.ratio).toBe(1.0); // clamped to min ratio 1.0
    });

    it('clamps ratio between 1 and 10', () => {
      // Extremely high camera vs sessions: 500 / 10 = 50 -> clamped to 10
      const highInput: SelectOccupancyInput = {
        camera: createCamera(5, 500),
        cameraBaseline: 0,
        decayWeighted: 10,
        lastRatio: null,
        now,
        staleCameraSec,
      };
      expect(selectOccupancy(highInput).ratio).toBe(10);

      // Low camera vs sessions: 10 / 100 = 0.1 -> clamped to 1
      const lowInput: SelectOccupancyInput = {
        camera: createCamera(5, 10),
        cameraBaseline: 0,
        decayWeighted: 100,
        lastRatio: null,
        now,
        staleCameraSec,
      };
      expect(selectOccupancy(lowInput).ratio).toBe(1);
    });
  });

  describe('calibrationRatio', () => {
    it('returns clamped observed when prev is null', () => {
      expect(calibrationRatio(null, 3.5)).toBe(3.5);
      expect(calibrationRatio(null, 15)).toBe(10); // clamped to 10
      expect(calibrationRatio(null, 0.5)).toBe(1); // clamped to 1
    });

    it('computes EMA with prev and clamps to [1, 10]', () => {
      // prev = 2.0, observed = 4.0, alpha = 0.2 -> 0.2 * 4.0 + 0.8 * 2.0 = 0.8 + 1.6 = 2.4
      expect(calibrationRatio(2.0, 4.0, 0.2)).toBe(2.4);
      // default alpha = 0.2
      expect(calibrationRatio(2.0, 4.0)).toBe(2.4);
      // extreme observed is clamped before EMA
      expect(calibrationRatio(2.0, 100, 0.5)).toBe(6.0); // 0.5*10 + 0.5*2 = 6.0
    });
  });
});
