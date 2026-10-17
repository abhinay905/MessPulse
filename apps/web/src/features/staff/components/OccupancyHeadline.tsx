/**
 * features/staff/components/OccupancyHeadline.tsx — High-contrast glanceable mess crowd metrics.
 * DOC3 §3.6.
 */

import React from 'react';
import { Users, Clock, Flame } from 'lucide-react';
import type { StatusSnapshot } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

interface OccupancyHeadlineProps {
  snapshot: StatusSnapshot | null;
}

export const OccupancyHeadline: React.FC<OccupancyHeadlineProps> = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <Card className="p-5 animate-pulse h-28 bg-slate-900/50 border-slate-800" />
    );
  }

  const occupancy = snapshot.occupancy.value;
  const capacity = snapshot.occupancy.capacity;
  const percentage = Math.min(100, Math.round((occupancy / capacity) * 100));

  const levelVariant =
    snapshot.occupancy.level === 'low'
      ? 'low'
      : snapshot.occupancy.level === 'medium'
      ? 'medium'
      : 'high';

  return (
    <Card elevated className="p-5 border-slate-800 bg-slate-900/90 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Dining Hall Floor
          </h2>
        </div>
        <Badge variant={levelVariant} className="uppercase text-[10px]">
          {snapshot.occupancy.level} crowd ({percentage}%)
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 block uppercase font-medium">Occupancy</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-black text-white font-mono">{occupancy}</span>
            <span className="text-xs text-slate-500 font-mono">/ {capacity}</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 block uppercase font-medium">Est. Queue Wait</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-black text-white font-mono">
              {snapshot.waitMin === 0 ? '0' : `~${snapshot.waitMin}`}
            </span>
            <span className="text-xs text-slate-500">min</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 block uppercase font-medium">Active App Sessions</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-black text-white font-mono">{snapshot.activeSessions}</span>
            <span className="text-xs text-slate-500">students</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
