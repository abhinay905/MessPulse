/**
 * features/student/StudentPage.tsx — Student live occupancy view.
 * DOC3 §3.3.
 *
 * Presentation-only:
 * - State branching: loading, closed, live, reconnecting banner
 * - Renders OccupancyGauge, WaitTimeCard, BestWindows
 * - Does NOT compute levels, waits, or decay
 */

import React from 'react';
import { UtensilsCrossed, WifiOff, LogOut, Moon, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useLiveStatus } from './hooks/useLiveStatus';
import { OccupancyGauge } from './components/OccupancyGauge';
import { WaitTimeCard } from './components/WaitTimeCard';
import { BestWindows } from './components/BestWindows';
import { CheckInCard } from './components/CheckInCard';
import { OptOutToggle } from '../optouts';
import { Card } from '../../components/ui/Card';
import { formatSecondsAgo } from '../../lib/format';

export const StudentPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { snapshot, connection, lastUpdatedAt, refetch } = useLiveStatus();

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100">
      {/* Reconnecting / Offline Banner (DOC3 §3.3) */}
      {(connection === 'reconnecting' || connection === 'offline') && (
        <aside
          aria-label="Connection Status"
          className="sticky top-0 z-50 w-full px-4 py-2 bg-amber-500/90 text-slate-950 text-xs font-semibold flex items-center justify-between shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
            <span>
              {connection === 'offline' ? 'Offline' : 'Reconnecting to live feed…'}{' '}
              {lastUpdatedAt && `(last updated ${formatSecondsAgo(lastUpdatedAt)})`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 font-bold text-[11px] transition-colors"
          >
            Retry
          </button>
        </aside>
      )}

      {/* Main Top Header */}
      <header className="w-full max-w-md mx-auto px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">
              MessPulse
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {snapshot?.messId || 'Hostel Dining Hall'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            title="Refresh status"
            aria-label="Refresh status"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={logout}
            title={`Log out (${user?.email || 'User'})`}
            aria-label="Log out"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto px-4 pb-8 flex-1 space-y-4">
        {!snapshot ? (
          /* Loading Skeleton */
          <div className="space-y-4 animate-pulse pt-4">
            <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800" />
            <div className="h-20 rounded-2xl bg-slate-900/60 border border-slate-800" />
            <div className="h-32 rounded-2xl bg-slate-900/60 border border-slate-800" />
          </div>
        ) : snapshot.state === 'closed' ? (
          /* Mess Closed State (DOC3 §3.3) */
          <Card elevated className="p-8 text-center space-y-3 my-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
              <Moon className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Mess is currently closed
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              No meal is active right now. Real-time crowd occupancy, wait times, and arrival windows will appear when the next meal starts.
            </p>
          </Card>
        ) : (
          /* Mess Open Live Feed */
          <div className="space-y-4">
            {/* Meal Banner */}
            {snapshot.mealId && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs">
                <span className="text-slate-400">Current Meal:</span>
                <span className="font-bold text-brand-300 uppercase tracking-wider font-mono">
                  {snapshot.mealId}
                </span>
              </div>
            )}

            {/* Occupancy Gauge Card */}
            <OccupancyGauge snapshot={snapshot} />

            {/* Check-In Card / Active Session */}
            <CheckInCard />

            {/* Advance Opt-Out Toggle ("Skipping Today") (DOC4 Step 17) */}
            <OptOutToggle mealId={snapshot.mealId} />

            {/* Queue Wait Time Card */}
            <WaitTimeCard snapshot={snapshot} />

            {/* Best Arrival Windows Card */}
            <BestWindows snapshot={snapshot} />
          </div>
        )}
      </main>
    </div>
  );
};
