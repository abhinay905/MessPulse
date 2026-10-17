import { describe, expect, it } from 'vitest';
import { evaluateTrayDepletion, type TrayDepletionInput } from './tray';

describe('evaluateTrayDepletion', () => {
  const baseInput: TrayDepletionInput = {
    enteredSoFar: 200,
    velocityPerMin: 15,
    trayCapacityPortions: 400,
    portionsPerPerson: 1,
    horizonMin: 10,
    warnRatio: 0.85, // 400 * 0.85 = 340 portions
    clearRatio: 0.70, // 400 * 0.70 = 280 portions
    alreadyOpen: false,
  };

  it('skips (returns none) when staff has not set tray capacity (<= 0)', () => {
    expect(
      evaluateTrayDepletion({ ...baseInput, trayCapacityPortions: 0 })
    ).toBe('none');
    expect(
      evaluateTrayDepletion({ ...baseInput, trayCapacityPortions: -50 })
    ).toBe('none');
  });

  it('raises alert when !alreadyOpen and projected >= warnRatio', () => {
    // projected = (200 + 15 * 10) * 1 = 350 >= 340
    expect(evaluateTrayDepletion(baseInput)).toBe('raise');
  });

  it('does not raise when !alreadyOpen and projected < warnRatio', () => {
    // projected = (150 + 15 * 10) * 1 = 300 < 340
    expect(
      evaluateTrayDepletion({ ...baseInput, enteredSoFar: 150 })
    ).toBe('none');
  });

  it('clears alert when alreadyOpen and projected < clearRatio', () => {
    // projected = (100 + 10 * 10) * 1 = 200 < 280 (refill or slowed velocity)
    expect(
      evaluateTrayDepletion({
        ...baseInput,
        alreadyOpen: true,
        enteredSoFar: 100,
        velocityPerMin: 10,
      })
    ).toBe('clear');
  });

  it('does not clear (stays none) when alreadyOpen and projected is between clearRatio and warnRatio (hysteresis)', () => {
    // projected = 300 portions. 280 (clear) <= 300 < 340 (warn) -> 'none' (no flap)
    expect(
      evaluateTrayDepletion({
        ...baseInput,
        alreadyOpen: true,
        enteredSoFar: 150,
        velocityPerMin: 15, // projected = 150 + 150 = 300
      })
    ).toBe('none');
  });

  it('stays none when alreadyOpen and projected is still above warnRatio', () => {
    // projected = 350 >= 340 -> already open, don't re-raise or clear
    expect(
      evaluateTrayDepletion({
        ...baseInput,
        alreadyOpen: true,
      })
    ).toBe('none');
  });

  it('handles negative velocity or negative enteredSoFar gracefully', () => {
    expect(
      evaluateTrayDepletion({
        ...baseInput,
        velocityPerMin: -10,
        enteredSoFar: -50,
        portionsPerPerson: -1,
      })
    ).toBe('none');
  });
});
