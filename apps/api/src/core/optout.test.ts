/**
 * core/optout.test.ts — Unit tests for opt-out window rules.
 * DOC4 Step 17: boundary tests at cutoff −1 s/0/+1 s.
 */

import { describe, expect, it } from 'vitest';
import { computeOptOutCutoffAt, isOptOutWindowOpen } from './optout';

describe('Opt-out window pure functions', () => {
  const mealStartsAt = 1700000000000;
  const cutoffMin = 60; // 60 minutes = 3,600,000 ms
  const cutoffAt = mealStartsAt - 60 * 60 * 1000; // 1699996400000

  it('computes cutoff timestamp correctly', () => {
    expect(computeOptOutCutoffAt(mealStartsAt, cutoffMin)).toBe(cutoffAt);
  });

  it('is open strictly before cutoff (cutoff - 1 s)', () => {
    const now = cutoffAt - 1000;
    expect(isOptOutWindowOpen(mealStartsAt, cutoffMin, now)).toBe(true);
  });

  it('is closed at cutoff exactly (0 s)', () => {
    const now = cutoffAt;
    expect(isOptOutWindowOpen(mealStartsAt, cutoffMin, now)).toBe(false);
  });

  it('is closed after cutoff (cutoff + 1 s)', () => {
    const now = cutoffAt + 1000;
    expect(isOptOutWindowOpen(mealStartsAt, cutoffMin, now)).toBe(false);
  });

  it('is closed well after meal starts', () => {
    const now = mealStartsAt + 10000;
    expect(isOptOutWindowOpen(mealStartsAt, cutoffMin, now)).toBe(false);
  });
});
