/**
 * features/admin/components/DecayCurveChart.tsx — Visualizes theoretical decay curve and live session weight distribution.
 * DOC3 §3.7, DOC4 Step 14.
 */

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Activity, Users, RefreshCw } from 'lucide-react';
import type { DecayCurveResponse } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface DecayCurveChartProps {
  data: DecayCurveResponse | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const DecayCurveChart: React.FC<DecayCurveChartProps> = ({
  data,
  isLoading,
  error,
  onRefresh,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="decay-curve-charts">
      {/* 1. Theoretical Decay Curve */}
      <Card className="p-6 bg-slate-900 border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Theoretical Decay Function</h3>
              <p className="text-xs text-slate-400">
                Session weight w(t) from check-in (1.0) to hard cutoff (0.0)
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="refresh-decay-curve"
            className="border-slate-700 hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="w-full h-64 min-h-[250px]">
          {data && data.theoretical.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.theoretical}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis
                  dataKey="offsetMin"
                  tickFormatter={(val: number) => `${val}m`}
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1.0]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#f8fafc',
                  }}
                  formatter={(val: number) => [`Weight: ${Number(val).toFixed(2)}`, 'w(t)']}
                  labelFormatter={(min: number) => `Elapsed: ${min} minutes`}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight w(t)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
              {isLoading ? 'Computing decay curve...' : 'No curve data available'}
            </div>
          )}
        </div>
      </Card>

      {/* 2. Live Session Weight Distribution Histogram */}
      <Card className="p-6 bg-slate-900 border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Active Sessions Distribution</h3>
              <p className="text-xs text-slate-400">
                Current students in dining hall bucketed by current weight
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-purple-950/60 border border-purple-800/60 rounded-full text-xs font-semibold text-purple-300">
            {data ? `${data.activeSessions} active` : '0 active'}
          </div>
        </div>

        <div className="w-full h-64 min-h-[250px]">
          {data && data.liveHistogram.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.liveHistogram}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="bin" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#f8fafc',
                  }}
                  formatter={(cnt: number) => [`${cnt} students`, 'Active Count']}
                  labelFormatter={(bin: string) => `Weight Tier: ${bin}`}
                />
                <Bar dataKey="count" name="Students" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
              {isLoading ? 'Loading active distribution...' : 'No active sessions'}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
export default DecayCurveChart;
