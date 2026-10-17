/**
 * core/decay.ts — probabilistic decay calculation for active diner sessions.
 * DOC3 §3.4, §3.0 #1.
 * Pure domain functions: no I/O, no framework imports.
 */

export interface DecayStage {
  untilOffsetMin: number;
  weight: number;
}

export interface DecaySettings {
  tail: DecayStage[];
}

export interface SessionDecayInput {
  checkedInAt: number;     // epoch ms
  expectedStaySec: number; // seconds
  hardExpirySec: number;   // seconds
}

/**
 * Computes the occupancy weight of a session at a given timestamp `now`.
 *
 * Rules (DOC3 §3.0 #1, §3.4):
 * - elapsed = (now − checkedInAt) / 1000
 * - elapsed < 0 → 1.0 (clock skew guard)
 * - elapsed >= hardExpirySec → 0
 * - elapsed < expectedStaySec → 1.0
 * - else offset = (elapsed − expectedStaySec) / 60
 *   first tail stage with offset < untilOffsetMin → its weight
 *   beyond last stage → 0
 */
export function sessionWeight(
  session: SessionDecayInput,
  now: number,
  decay: DecaySettings
): number {
  const elapsedSec = (now - session.checkedInAt) / 1000;

  if (elapsedSec < 0) {
    return 1.0;
  }
  if (elapsedSec >= session.hardExpirySec) {
    return 0;
  }
  if (elapsedSec < session.expectedStaySec) {
    return 1.0;
  }

  const offsetMin = (elapsedSec - session.expectedStaySec) / 60;
  for (const stage of decay.tail) {
    if (offsetMin < stage.untilOffsetMin) {
      return stage.weight;
    }
  }

  return 0;
}

/**
 * Sums weights across an array of active sessions.
 */
export function sumSessionWeights(
  sessions: SessionDecayInput[],
  now: number,
  decay: DecaySettings
): number {
  let sum = 0;
  for (const session of sessions) {
    sum += sessionWeight(session, now, decay);
  }
  return sum;
}
