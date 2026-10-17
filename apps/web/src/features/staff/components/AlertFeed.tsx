/**
 * features/staff/components/AlertFeed.tsx — Chronological history feed of meal alerts.
 * DOC3 §3.6.
 */

import React from 'react';
import { History, Bell, CheckCircle2, CheckCheck } from 'lucide-react';
import type { AlertDTO } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { formatSecondsAgo } from '../../../lib/format';

interface AlertFeedProps {
  alerts: AlertDTO[];
}

export const AlertFeed: React.FC<AlertFeedProps> = ({ alerts }) => {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Alert Activity Feed
          </h2>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {alerts.length} total events
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          <Bell className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-slate-400" />
          <p>No alerts recorded for this shift. Station is running calmly.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {alerts.map((alert) => {
            const isCleared = !!alert.clearedAt;
            const isAcked = !!alert.ackedAt;

            return (
              <div
                key={alert.id}
                className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                  isCleared
                    ? 'bg-slate-900/40 border-slate-800 text-slate-400'
                    : isAcked
                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                    : 'bg-rose-950/20 border-rose-500/40 text-rose-200 font-medium'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[11px] text-white">
                      {alert.ruleId === 'tray-depletion' ? 'Tray Depletion' : alert.ruleId}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      • {formatSecondsAgo(alert.raisedAt)}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug">{alert.message}</p>
                </div>

                <div className="shrink-0 pt-0.5">
                  {isCleared ? (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] font-mono flex items-center gap-1">
                      <CheckCheck className="w-2.5 h-2.5 text-slate-400" /> Cleared
                    </span>
                  ) : isAcked ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[9px] font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-amber-400" /> Acked
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/50 text-rose-300 text-[9px] font-mono font-bold animate-pulse">
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
