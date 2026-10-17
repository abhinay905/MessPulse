import { describe, expect, it } from 'vitest';
import {
  sessionWeight,
  sumSessionWeights,
  type DecaySettings,
  type SessionDecayInput,
} from './decay';

describe('decay domain logic', () => {
  const standardDecay: DecaySettings = {
    tail: [
      { untilOffsetMin: 8, weight: 0.6 },
      { untilOffsetMin: 17, weight: 0.25 },
    ],
  };

  // Base session: checked in at t = 1,000,000 ms (1000s)
  // S = 1080s (18 min)
  // Hard expiry = 2100s (35 min = S + 17 min)
  // maxSession = 3600s (60 min)
  const checkedInAt = 1_000_000;
  const S_sec = 1080;
  const hardExpirySec = 2100;

  const baseSession: SessionDecayInput = {
    checkedInAt,
    expectedStaySec: S_sec,
    hardExpirySec,
  };

  describe('sessionWeight — boundary cases', () => {
    it.each<[string, number, number]>([
      // Name, timestamp (epoch ms), expected weight
      [
        'S - 1 s (before expected stay)',
        checkedInAt + (S_sec - 1) * 1000,
        1.0,
      ],
      [
        'S exactly (offset 0 min, start of 0.60 bracket)',
        checkedInAt + S_sec * 1000,
        0.6,
      ],
      [
        'S + 7:59 (offset 7m 59s, end of 0.60 bracket)',
        checkedInAt + (S_sec + 7 * 60 + 59) * 1000,
        0.6,
      ],
      [
        'S + 8:00 (offset 8m 00s, start of 0.25 bracket)',
        checkedInAt + (S_sec + 8 * 60) * 1000,
        0.25,
      ],
      [
        'S + 16:59 (offset 16m 59s, end of 0.25 bracket)',
        checkedInAt + (S_sec + 16 * 60 + 59) * 1000,
        0.25,
      ],
      [
        'S + 17:00 (offset 17m 00s, hard expiry reached)',
        checkedInAt + (S_sec + 17 * 60) * 1000,
        0.0,
      ],
      [
        'Beyond hard expiry (S + 20 min)',
        checkedInAt + (S_sec + 20 * 60) * 1000,
        0.0,
      ],
      [
        'At maxSessionMin boundary (60 min = 3600s)',
        checkedInAt + 3600 * 1000,
        0.0,
      ],
      [
        'Clock skew: now before checkedInAt',
        checkedInAt - 5000,
        1.0,
      ],
    ])('%s', (_name, now, expectedWeight) => {
      const weight = sessionWeight(baseSession, now, standardDecay);
      expect(weight).toBeCloseTo(expectedWeight, 5);
    });

    it('returns 0 when offset is beyond custom tail stages but before hardExpirySec', () => {
      const customDecay: DecaySettings = {
        tail: [{ untilOffsetMin: 5, weight: 0.5 }],
      };
      // S = 1000s, hardExpiry = 3000s. At S + 6 min (offset 6 min), beyond last stage (5)
      const session: SessionDecayInput = {
        checkedInAt: 0,
        expectedStaySec: 1000,
        hardExpirySec: 3000,
      };
      const now = (1000 + 6 * 60) * 1000;
      expect(sessionWeight(session, now, customDecay)).toBe(0);
    });
  });

  describe('sumSessionWeights', () => {
    it('sums weights of multiple sessions in different decay stages', () => {
      const now = 2_000_000;
      const sessions: SessionDecayInput[] = [
        // Session 1: freshly entered -> weight 1.0
        {
          checkedInAt: now - 300 * 1000, // 5 min ago
          expectedStaySec: 1080,
          hardExpirySec: 2100,
        },
        // Session 2: at S + 4 min -> weight 0.60
        {
          checkedInAt: now - (1080 + 4 * 60) * 1000,
          expectedStaySec: 1080,
          hardExpirySec: 2100,
        },
        // Session 3: at S + 10 min -> weight 0.25
        {
          checkedInAt: now - (1080 + 10 * 60) * 1000,
          expectedStaySec: 1080,
          hardExpirySec: 2100,
        },
        // Session 4: expired -> weight 0.0
        {
          checkedInAt: now - 3000 * 1000,
          expectedStaySec: 1080,
          hardExpirySec: 2100,
        },
      ];

      const sum = sumSessionWeights(sessions, now, standardDecay);
      expect(sum).toBeCloseTo(1.0 + 0.6 + 0.25 + 0.0, 5);
    });

    it('returns 0 for empty session list', () => {
      expect(sumSessionWeights([], 1_000_000, standardDecay)).toBe(0);
    });
  });
});
