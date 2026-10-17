/**
 * core/timing.ts — session timing calculation.
 * DOC3 §3.4, §3.0 #1.
 * Pure domain function: no I/O, no framework imports.
 */

export interface SessionTimingInput {
  baseMealMin: number;
  queueWaitSec: number;
  menuDemandFactorMin: number;
  decayTailMin: number; // =17, derived from settings
  maxSessionMin: number;
}

export interface SessionTimingResult {
  expectedStaySec: number;
  hardExpirySec: number;
}

/**
 * Computes expected stay duration and hard expiry cutoff for a dining session.
 *
 * expectedStay = (baseMealMin + menuDemandFactorMin) * 60 + queueWaitSec
 * hardExpiry   = min(expectedStay + decayTailMin * 60, maxSessionMin * 60)
 * expectedStay itself is also clamped to hardExpiry.
 */
export function computeSessionTiming(input: SessionTimingInput): SessionTimingResult {
  const baseMealSec = Math.max(0, input.baseMealMin) * 60;
  const menuDemandSec = Math.max(0, input.menuDemandFactorMin) * 60;
  const queueWaitSec = Math.max(0, input.queueWaitSec);
  const decayTailSec = Math.max(0, input.decayTailMin) * 60;
  const maxSessionSec = Math.max(0, input.maxSessionMin) * 60;

  const rawExpectedStaySec = Math.round(baseMealSec + menuDemandSec + queueWaitSec);
  const hardExpirySec = Math.min(rawExpectedStaySec + decayTailSec, maxSessionSec);
  const expectedStaySec = Math.min(rawExpectedStaySec, hardExpirySec);

  return { expectedStaySec, hardExpirySec };
}
