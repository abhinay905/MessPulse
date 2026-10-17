import { describe, expect, it } from 'vitest';
import { computeSessionTiming, type SessionTimingInput } from './timing';

describe('computeSessionTiming', () => {
  it.each<[string, SessionTimingInput, { expectedStaySec: number; hardExpirySec: number }]>([
    [
      'no queue wait (DOC3 §3.0 #1 base case)',
      {
        baseMealMin: 18,
        queueWaitSec: 0,
        menuDemandFactorMin: 0,
        decayTailMin: 17,
        maxSessionMin: 60,
      },
      {
        expectedStaySec: 1080, // 18 min
        hardExpirySec: 2100,   // 35 min = 18 + 17
      },
    ],
    [
      'queue wait 10 min (600s)',
      {
        baseMealMin: 18,
        queueWaitSec: 600,
        menuDemandFactorMin: 0,
        decayTailMin: 17,
        maxSessionMin: 60,
      },
      {
        expectedStaySec: 1680, // 28 min
        hardExpirySec: 2700,   // 45 min = 28 + 17
      },
    ],
    [
      'menu demand factor 5 min',
      {
        baseMealMin: 18,
        queueWaitSec: 0,
        menuDemandFactorMin: 5,
        decayTailMin: 17,
        maxSessionMin: 60,
      },
      {
        expectedStaySec: 1380, // 23 min
        hardExpirySec: 2400,   // 40 min = 23 + 17
      },
    ],
    [
      'queue wait + demand factor combined',
      {
        baseMealMin: 18,
        queueWaitSec: 300,
        menuDemandFactorMin: 2,
        decayTailMin: 17,
        maxSessionMin: 60,
      },
      {
        expectedStaySec: 1500, // 25 min = (18+2)*60 + 300
        hardExpirySec: 2520,   // 42 min = 1500 + 1020
      },
    ],
    [
      'hard expiry capped by maxSessionMin',
      {
        baseMealMin: 20,
        queueWaitSec: 600,
        menuDemandFactorMin: 10,
        decayTailMin: 17,
        maxSessionMin: 40, // 2400 s
      },
      {
        expectedStaySec: 2400, // clamped to hardExpiry (2400)
        hardExpirySec: 2400,   // 40 min cap
      },
    ],
    [
      'extreme cap: maxSessionMin shorter than expected stay',
      {
        baseMealMin: 25,
        queueWaitSec: 0,
        menuDemandFactorMin: 0,
        decayTailMin: 17,
        maxSessionMin: 15, // 900 s
      },
      {
        expectedStaySec: 900,  // clamped to hardExpiry
        hardExpirySec: 900,
      },
    ],
    [
      'negative inputs clamped to zero',
      {
        baseMealMin: -5,
        queueWaitSec: -100,
        menuDemandFactorMin: -2,
        decayTailMin: -10,
        maxSessionMin: -30,
      },
      {
        expectedStaySec: 0,
        hardExpirySec: 0,
      },
    ],
  ])('%s', (_name, input, expected) => {
    const result = computeSessionTiming(input);
    expect(result).toEqual(expected);
  });
});
