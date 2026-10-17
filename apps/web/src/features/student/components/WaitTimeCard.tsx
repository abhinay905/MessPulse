import React from 'react';
import type { StatusSnapshot } from '@messpulse/shared';
import { Clock, Users } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { formatWaitRange } from '../../../lib/format';

interface WaitTimeCardProps {
  snapshot: StatusSnapshot;
}

export const WaitTimeCard: React.FC<WaitTimeCardProps> = ({ snapshot }) => {
  const { waitRangeMin, occupancy } = snapshot;
  const formattedWait = formatWaitRange(waitRangeMin);

  return (
    <Card className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-brand-950/70 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Est. Queue Wait
            </span>
            {occupancy.stale && (
              <Badge variant="estimated" className="text-[10px] py-0 px-1.5">
                Est
              </Badge>
            )}
          </div>
          <div className="text-xl font-extrabold text-white font-mono tracking-tight">
            {formattedWait}
          </div>
        </div>
      </div>

      <div className="text-right">
        <span className="text-[11px] text-slate-400 block">Active Sessions</span>
        <span className="text-xs font-bold text-slate-300 font-mono inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-brand-400" />
          {snapshot.activeSessions}
        </span>
      </div>
    </Card>
  );
};
