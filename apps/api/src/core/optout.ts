/**
 * core/optout.ts — Pure functions for advance opt-out window evaluation.
 * DOC3 §3.12, DOC3 §3.13.
 */

/**
 * Computes the epoch ms timestamp when the opt-out window closes for a meal.
 * Cutoff is cutoffMin minutes before meal startsAt.
 */
export function computeOptOutCutoffAt(mealStartsAt: number, cutoffMin: number): number {
  return mealStartsAt - cutoffMin * 60 * 1000;
}

/**
 * Checks if the advance opt-out window is currently open for a meal.
 * Window is open strictly before the cutoff timestamp.
 * At or after cutoff (or after meal starts), window is closed.
 */
export function isOptOutWindowOpen(mealStartsAt: number, cutoffMin: number, now: number): boolean {
  const cutoffAt = computeOptOutCutoffAt(mealStartsAt, cutoffMin);
  return now < cutoffAt;
}
