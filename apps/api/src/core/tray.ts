/**
 * core/tray.ts — pure tray depletion alert logic.
 * DOC3 §3.6.
 * Pure domain function: no I/O, no framework imports.
 */

export interface TrayDepletionInput {
  enteredSoFar: number;
  velocityPerMin: number;
  trayCapacityPortions: number;
  portionsPerPerson: number;
  horizonMin: number;
  warnRatio: number;
  clearRatio: number;
  alreadyOpen: boolean;
}

export type TrayDepletionOutcome = 'raise' | 'clear' | 'none';

/**
 * Evaluates whether a tray-depletion alert should be raised, cleared, or kept unchanged.
 *
 * Rules (DOC3 §3.6):
 * - If trayCapacityPortions <= 0: return 'none' (staff has not configured capacity)
 * - projected = (enteredSoFar + velocityPerMin * horizonMin) * portionsPerPerson
 * - raise if !alreadyOpen && projected >= trayCapacityPortions * warnRatio (default 0.85)
 * - clear if alreadyOpen && projected < trayCapacityPortions * clearRatio (default 0.70)
 * - otherwise 'none' (hysteresis prevents flapping)
 */
export function evaluateTrayDepletion(input: TrayDepletionInput): TrayDepletionOutcome {
  if (input.trayCapacityPortions <= 0) {
    return 'none';
  }

  const safeVelocity = Math.max(0, input.velocityPerMin);
  const safeEntered = Math.max(0, input.enteredSoFar);
  const safePortionsPerPerson = Math.max(0, input.portionsPerPerson);

  const projected = (safeEntered + safeVelocity * input.horizonMin) * safePortionsPerPerson;

  if (!input.alreadyOpen && projected >= input.trayCapacityPortions * input.warnRatio) {
    return 'raise';
  }

  if (input.alreadyOpen && projected < input.trayCapacityPortions * input.clearRatio) {
    return 'clear';
  }

  return 'none';
}
