/**
 * features/staff/components/AlertBanner.tsx — Calm, persistent alert banner.
 * DOC3 §3.6.
 *
 * Rules:
 * - Stays visible while alert is open; never modal; never steals focus.
 * - Displays server-generated message.
 * - Acknowledge button allows staff to acknowledge without blocking the screen.
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AlertDTO } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface AlertBannerProps {
  alert: AlertDTO;
  onAck: (alertId: string) => Promise<void>;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alert, onAck }) => {
  const [isAcking, setIsAcking] = useState<boolean>(false);
  const isAcked = !!alert.ackedAt;

  const handleAck = async () => {
    setIsAcking(true);
    try {
      await onAck(alert.id);
    } finally {
      setIsAcking(false);
    }
  };

  return (
    <Card
      elevated
      className={`p-4 border transition-colors duration-200 ${
        isAcked
          ? 'border-amber-600/30 bg-amber-950/20'
          : 'border-rose-500/50 bg-rose-950/30 shadow-lg shadow-rose-950/40'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isAcked
                ? 'bg-amber-900/40 text-amber-400'
                : 'bg-rose-900/60 text-rose-300 animate-pulse'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                {alert.ruleId === 'tray-depletion' ? 'Kitchen Demand Warning' : 'Staff Alert'}
              </span>
              {isAcked && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Acknowledged
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-white mt-0.5">{alert.message}</p>
          </div>
        </div>

        <div className="shrink-0">
          {!isAcked ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isAcking}
              onClick={handleAck}
              className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs px-4"
            >
              Acknowledge
            </Button>
          ) : (
            <span className="text-xs text-slate-400 font-mono italic">
              Awaiting supply refill...
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};
