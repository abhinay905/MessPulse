/**
 * features/admin/components/CameraHealthCard.tsx — Camera hardware telemetry & health status.
 * DOC3 §3.7.
 */

import React from 'react';
import { Camera, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { StatusSnapshot } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { formatSecondsAgo } from '../../../lib/format';

interface CameraHealthCardProps {
  snapshot: StatusSnapshot | null;
}

export const CameraHealthCard: React.FC<CameraHealthCardProps> = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <Card className="p-4 animate-pulse h-36 bg-slate-900/60 border-slate-800" />
    );
  }

  const isStale = snapshot.camera.stale;
  const lastSeenAt = snapshot.camera.lastSeenAt;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Vision Sensor Telemetry
          </h2>
        </div>
        {isStale ? (
          <Badge variant="high" className="flex items-center gap-1 text-[10px]">
            <AlertTriangle className="w-3 h-3" /> STALE FEED (&gt;30s)
          </Badge>
        ) : (
          <Badge variant="low" className="flex items-center gap-1 text-[10px]">
            <CheckCircle2 className="w-3 h-3" /> ONLINE (STREAMING)
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase font-medium">Last Ping</span>
          <p className="font-mono text-white text-xs font-semibold mt-0.5">
            {lastSeenAt ? formatSecondsAgo(lastSeenAt) : 'No ping received'}
          </p>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase font-medium">Active Source</span>
          <p className="font-mono text-white text-xs font-semibold mt-0.5 capitalize">
            {snapshot.occupancy.source}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Privacy boundary: Edge processing only. Zero face/frame data sent.</span>
      </div>
    </Card>
  );
};
