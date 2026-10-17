import React from 'react';
import type { StatusSnapshot } from '@messpulse/shared';
import { Sparkles, CalendarClock, TrendingDown } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { formatClockTime } from '../../../lib/format';

interface BestWindowsProps {
  snapshot: StatusSnapshot;
}

export const BestWindows: React.FC<BestWindowsProps> = ({ snapshot }) => {
  const { bestWindows } = snapshot;

  if (!bestWindows || bestWindows.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Best Arrival Windows
          </h2>
        </div>
        <span className="text-[11px] text-brand-300 font-medium inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Shortest wait
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {bestWindows.map((win, idx) => {
          const fromStr = formatClockTime(win.startsAt);
          const toStr = formatClockTime(win.endsAt);

          return (
            <div
              key={`${win.startsAt}-${win.endsAt}-${idx}`}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-brand-500/30 transition-all text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-brand-950 border border-brand-500/30 text-brand-400 font-mono font-bold flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
                <span className="font-semibold text-slate-200 font-mono">
                  {fromStr} – {toStr}
                </span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>~{win.estWaitMin}m wait</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
