/**
 * modules/alerts/alert-rule.ts — AlertRule contract and outcome.
 * DOC3 §3.6.
 */

import type { RuleContext } from './alerts.ports';

export interface RuleOutcome {
  action: 'raise' | 'clear' | 'none';
  severity?: 'info' | 'warning' | 'critical';
  message?: string;
  payload?: Record<string, unknown>;
}

export interface AlertRule {
  readonly id: string;
  evaluate(ctx: RuleContext): Promise<RuleOutcome> | RuleOutcome;
}
