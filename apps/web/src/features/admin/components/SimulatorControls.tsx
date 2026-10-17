/**
 * features/admin/components/SimulatorControls.tsx — Demo lunch rush controller.
 * DOC3 §3.9, DOC4 Step 14.
 */

import React, { useState } from 'react';
import { Play, Square, FastForward, Activity, Sparkles } from 'lucide-react';
import type { SimulatorStatus, SimulatorStartInput } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface SimulatorControlsProps {
  status: SimulatorStatus | null;
  isLoading: boolean;
  isActionLoading: boolean;
  onStart: (opts?: Partial<SimulatorStartInput>) => Promise<boolean>;
  onStop: () => Promise<boolean>;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  status,
  isActionLoading,
  onStart,
  onStop,
}) => {
  const [speed, setSpeed] = useState<number>(6);
  const [peakPeople, setPeakPeople] = useState<number>(220);
  const isRunning = !!status?.running;

  const handleStart = async () => {
    await onStart({
      speed,
      peakPeople,
      durationMin: 18,
      appAdoption: 0.7,
      seed: 42,
    });
  };

  return (
    <Card className="p-5 space-y-4" data-testid="simulator-controls">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FastForward className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Demo Simulator & Rush Replay
          </h2>
        </div>
        {isRunning ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
            <Activity className="w-3 h-3 text-emerald-400" />
            RUNNING ({status.speed}x SPEED)
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-mono text-[10px]">
            IDLE
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Simulates an 18-minute Gaussian lunch crowd with 70% mobile app check-ins in 3 real minutes.
      </p>

      {/* Simulator Metrics when running */}
      {isRunning && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Simulated Elapsed</span>
            <span className="font-mono text-white font-bold">
              {status?.simulatedElapsedMin !== null ? `${status?.simulatedElapsedMin} min` : '0 min'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Remaining Events</span>
            <span className="font-mono text-white font-bold">
              {status?.eventsRemaining ?? 0}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Run ID</span>
            <span className="font-mono text-slate-400 text-[10px] truncate block">
              {status?.runId ? status.runId.slice(0, 8) : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Controls Form */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {!isRunning ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400">Speed:</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value={1}>1x (Realtime)</option>
                <option value={3}>3x (6 min demo)</option>
                <option value={6}>6x (3 min demo)</option>
                <option value={10}>10x (Fast)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400">Peak:</span>
              <input
                type="number"
                min={50}
                max={500}
                value={peakPeople}
                onChange={(e) => setPeakPeople(Number(e.target.value))}
                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <Button
              size="sm"
              onClick={handleStart}
              isLoading={isActionLoading}
              leftIcon={<Play className="w-3.5 h-3.5 text-white fill-white" />}
              className="text-xs font-semibold ml-auto"
            >
              Start 3-Min Rush Demo
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={onStop}
            isLoading={isActionLoading}
            leftIcon={<Square className="w-3.5 h-3.5" />}
            className="text-xs font-semibold w-full"
          >
            Stop Simulator & Restore Real Clock
          </Button>
        )}
      </div>
    </Card>
  );
};
