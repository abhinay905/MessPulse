/**
 * modules/alerts/alert-engine.ts — AlertEngine rule evaluator.
 * DOC3 §3.6.
 *
 * Rules:
 * - Register rules dynamically (Open/Closed Principle)
 * - Evaluate all registered rules against RuleContext
 * - Isolated per-rule error handling: a throwing rule does not stop other rules
 */

import type { AlertRule, RuleOutcome } from './alert-rule';
import type { RuleContext } from './alerts.ports';
import { logger } from '../../infra/logger';

export interface EvaluatedRuleOutcome {
  ruleId: string;
  outcome: RuleOutcome;
}

export class AlertEngine {
  private readonly rules = new Map<string, AlertRule>();

  register(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  async evaluate(ctx: RuleContext): Promise<EvaluatedRuleOutcome[]> {
    const results: EvaluatedRuleOutcome[] = [];

    for (const rule of this.rules.values()) {
      try {
        const outcome = await Promise.resolve(rule.evaluate(ctx));
        results.push({ ruleId: rule.id, outcome });
      } catch (err) {
        logger.error({ ruleId: rule.id, err }, `Alert rule threw during evaluation [${rule.id}]`);
        results.push({ ruleId: rule.id, outcome: { action: 'none' } });
      }
    }

    return results;
  }
}
