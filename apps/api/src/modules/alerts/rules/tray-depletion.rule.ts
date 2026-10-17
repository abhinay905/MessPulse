/**
 * modules/alerts/rules/tray-depletion.rule.ts — Tray depletion alert rule.
 * DOC3 §3.6.
 */

import { evaluateTrayDepletion } from '../../../core/tray';
import type { AlertRule, RuleOutcome } from '../alert-rule';
import type { RuleContext } from '../alerts.ports';

export class TrayDepletionRule implements AlertRule {
  readonly id = 'tray-depletion';

  evaluate(ctx: RuleContext): RuleOutcome {
    const capacity = ctx.meal.trayCapacity;
    if (capacity === undefined || capacity <= 0) {
      return { action: 'none' };
    }

    const warnRatio = 0.85;
    const clearRatio = 0.70;
    const horizonMin = 10;
    const portionsPerPerson = 1;

    const outcome = evaluateTrayDepletion({
      enteredSoFar: ctx.enteredSoFar,
      velocityPerMin: ctx.velocityPerMin,
      trayCapacityPortions: capacity,
      portionsPerPerson,
      horizonMin,
      warnRatio,
      clearRatio,
      alreadyOpen: ctx.openAlert !== null,
    });

    if (outcome === 'raise') {
      const remainingPortions = Math.max(0, capacity - ctx.enteredSoFar * portionsPerPerson);
      const inflowRate = ctx.velocityPerMin * portionsPerPerson;
      const minutesRemaining =
        inflowRate > 0 ? Math.max(1, Math.round(remainingPortions / inflowRate)) : horizonMin;

      return {
        action: 'raise',
        severity: 'warning',
        message: `Trays may run out in ~${minutesRemaining} min at current inflow`,
        payload: {
          trayCapacity: capacity,
          enteredSoFar: ctx.enteredSoFar,
          velocityPerMin: ctx.velocityPerMin,
          estimatedMinutesRemaining: minutesRemaining,
        },
      };
    }

    if (outcome === 'clear') {
      return {
        action: 'clear',
      };
    }

    return { action: 'none' };
  }
}
