import React from 'react';
import type { StatusSnapshot } from '@messpulse/shared';
import { Gauge } from '../../../components/ui/Gauge';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';

interface OccupancyGaugeProps {
  snapshot: StatusSnapshot;
}

export const OccupancyGauge: React.FC<OccupancyGaugeProps> = ({ snapshot }) => {
  const { occupancy, activeSessions } = snapshot;
  const { value, capacity, level, source, stale } = occupancy;

  return (
    <Card elevated className="p-5 flex flex-col items-center relative overflow-hidden">
      {/* Top status header */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Dining Hall Crowd
        </span>
        <div className="flex items-center gap-1.5">
          {stale ? (
            <Badge
              variant="estimated"
              title="Camera reading is stale (>30s) — estimated from active student check-in sessions"
            >
              Estimated
            </Badge>
          ) : (
            <Badge variant="live">Live</Badge>
          )}
          <Badge variant={level}>
            {level.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Radial Gauge Meter */}
      <Gauge
        value={value}
        capacity={capacity}
        level={level}
        className="my-1"
      />

      {/* Meta indicators under the gauge */}
      <div className="w-full mt-2 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span>
          Source:{' '}
          <span className="font-semibold text-slate-300 capitalize">
            {source === 'camera' ? 'Entrance Camera' : 'Session Model'}
          </span>
        </span>
        <span>
          Active Diners:{' '}
          <span className="font-semibold text-slate-300 font-mono">
            {activeSessions}
          </span>
        </span>
      </div>
    </Card>
  );
};
