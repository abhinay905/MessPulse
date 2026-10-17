/**
 * features/staff/components/TrayProgress.tsx — Visual tray consumption progress and alert forecast.
 * DOC3 §3.6.
 */

import React from 'react';
import { Utensils, AlertTriangle, Info } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

interface TrayProgressProps {
  trayCapacity?: number | undefined;
  enteredSoFar?: number | undefined;
}

export const TrayProgress: React.FC<TrayProgressProps> = ({
  trayCapacity,
  enteredSoFar = 0,
}) => {
  if (!trayCapacity || trayCapacity <= 0) {
    return (
      <Card className="p-4 border-dashed border-slate-800 bg-slate-900/40 text-center space-y-1.5">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-300">
          <Info className="w-4 h-4 text-brand-400" />
          <span>Tray Alerts Paused</span>
        </div>
        <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
          Enter tray capacity below to enable automated depletion forecasting and calm kitchen alerts.
        </p>
      </Card>
    );
  }

  const consumed = Math.min(trayCapacity, enteredSoFar);
  const percentUsed = Math.min(100, Math.round((consumed / trayCapacity) * 100));
  const remaining = Math.max(0, trayCapacity - consumed);

  const isLow = percentUsed >= 85;

  return (
    <Card elevated className={`p-4 space-y-3 ${isLow ? 'border-amber-500/40 bg-amber-950/10' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils className={`w-4 h-4 ${isLow ? 'text-amber-400' : 'text-brand-400'}`} />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Kitchen Tray Supply
          </h2>
        </div>
        <span className="text-xs font-mono font-semibold text-slate-400">
          {remaining} of {trayCapacity} remaining
        </span>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isLow
                ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                : 'bg-gradient-to-r from-brand-500 to-indigo-500'
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>{consumed} served ({percentUsed}%)</span>
          <span>Target: {trayCapacity} portions</span>
        </div>
      </div>

      {isLow && (
        <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Supply reaching buffer threshold. Prepare kitchen refill.</span>
        </div>
      )}
    </Card>
  );
};
