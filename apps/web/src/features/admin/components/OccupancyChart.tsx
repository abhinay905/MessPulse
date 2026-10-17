/**
 * features/admin/components/OccupancyChart.tsx — Time series chart for camera occupancy vs decay-weighted sessions.
 * DOC3 §3.7, DOC4 Step 14.
 */

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import type { TimeSeriesPoint } from '@messpulse/shared';
import type { TimeRangePreset } from '../hooks/useTimeSeries';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface OccupancyChartProps {
  data: TimeSeriesPoint[];
  range: TimeRangePreset;
  setRange: (r: TimeRangePreset) => void;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const OccupancyChart: React.FC<OccupancyChartProps> = ({
  data,
  range,
  setRange,
  isLoading,
  error,
  onRefresh,
}) => {
  const ranges: TimeRangePreset[] = ['1h', '6h', '24h', '7d'];

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    if (range === '24h' || range === '7d') {
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <Card className="p-6 bg-slate-900 border-slate-800" data-testid="occupancy-chart">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">Occupancy & Sessions Over Time</h3>
            <p className="text-xs text-slate-400">
              Camera headcount vs decay-weighted student sessions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Range buttons */}
          <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`range-${r}`}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  range === r
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="refresh-timeseries"
            className="border-slate-700 hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Latest summary metrics */}
      {latest && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/40">
            <span className="text-xs text-slate-400 block">Camera Count</span>
            <span className="text-xl font-bold text-cyan-400">{latest.camera}</span>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/40">
            <span className="text-xs text-slate-400 block">Decay-Weighted</span>
            <span className="text-xl font-bold text-violet-400">
              {latest.decayWeighted.toFixed(1)}
            </span>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/40">
            <span className="text-xs text-slate-400 block">Estimated Wait</span>
            <span className="text-xl font-bold text-amber-400">
              {latest.waitMin.toFixed(0)} min
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 mb-4 bg-red-950/40 border border-red-800/60 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="w-full h-80 min-h-[320px]">
        {data.length === 0 && !isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-sm">
            No historical data available for selected period ({range}).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cameraGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="decayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTimestamp}
                stroke="#64748b"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#f8fafc',
                }}
                labelFormatter={(value: number) => new Date(value).toLocaleString()}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
              <Area
                type="monotone"
                dataKey="camera"
                name="Camera Headcount"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cameraGrad)"
              />
              <Line
                type="monotone"
                dataKey="decayWeighted"
                name="Decay-Weighted Sessions"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};
export default OccupancyChart;
