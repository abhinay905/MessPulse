/**
 * features/staff/StaffPage.tsx — Calm staff controller and kitchen tray dashboard.
 * DOC3 §3.6, DOC4 Step 13.
 *
 * Principles:
 * - Screen stays calm unless an alert is open.
 * - Non-intrusive AlertBanner for open alerts with easy 1-tap ack.
 * - Gentle hint if tray capacity is unset.
 * - Web Audio chime plays only after explicit user activation.
 */

import React from 'react';
import { UtensilsCrossed, WifiOff, LogOut, RefreshCw, Moon } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useLiveStatus } from '../student/hooks/useLiveStatus';
import { useAlerts } from './hooks/useAlerts';
import { useAlertSound } from './hooks/useAlertSound';
import { EnableSoundButton } from './components/EnableSoundButton';
import { OccupancyHeadline } from './components/OccupancyHeadline';
import { TrayProgress } from './components/TrayProgress';
import { AlertBanner } from './components/AlertBanner';
import { AlertFeed } from './components/AlertFeed';
import { TrayCapacityForm } from './components/TrayCapacityForm';
import { Card } from '../../components/ui/Card';
import { formatSecondsAgo } from '../../lib/format';

export const StaffPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { snapshot, connection, lastUpdatedAt, refetch: refetchStatus } = useLiveStatus();
  const { isSoundEnabled, enableSound, playChime } = useAlertSound();

  const {
    alerts,
    openAlerts,
    ackAlert,
    updateTrayCapacity,
    refetch: refetchAlerts,
  } = useAlerts({
    onAlertRaised: () => {
      playChime();
    },
  });

  const handleRefresh = () => {
    void refetchStatus();
    void refetchAlerts();
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100">
      {/* Reconnecting / Offline Banner */}
      {(connection === 'reconnecting' || connection === 'offline') && (
        <aside
          aria-label="Connection Status"
          className="sticky top-0 z-50 w-full px-4 py-2 bg-amber-500/90 text-slate-950 text-xs font-semibold flex items-center justify-between shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
            <span>
              {connection === 'offline' ? 'Offline' : 'Reconnecting to station feed…'}{' '}
              {lastUpdatedAt && `(last updated ${formatSecondsAgo(lastUpdatedAt)})`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 font-bold text-[11px] transition-colors"
          >
            Retry
          </button>
        </aside>
      )}

      {/* Main Top Header */}
      <header className="w-full max-w-4xl mx-auto px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-amber-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none flex items-center gap-2">
              Staff Controller
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                {user?.role.toUpperCase()}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {snapshot?.messId || 'Hostel Dining Hall'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <EnableSoundButton
            isSoundEnabled={isSoundEnabled}
            onEnableSound={enableSound}
          />

          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh status"
            aria-label="Refresh status"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={logout}
            title={`Log out (${user?.email || 'Staff'})`}
            aria-label="Log out"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-4xl mx-auto px-4 pb-12 flex-1 space-y-4">
        {/* Open Alert Banners */}
        {openAlerts.length > 0 && (
          <div className="space-y-2.5 animate-fade-in">
            {openAlerts.map((alert) => (
              <AlertBanner key={alert.id} alert={alert} onAck={ackAlert} />
            ))}
          </div>
        )}

        {!snapshot ? (
          /* Loading Skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse pt-2">
            <div className="h-44 rounded-2xl bg-slate-900/60 border border-slate-800" />
            <div className="h-44 rounded-2xl bg-slate-900/60 border border-slate-800" />
          </div>
        ) : snapshot.state === 'closed' ? (
          /* Mess Closed State */
          <Card elevated className="p-8 text-center space-y-3 my-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <Moon className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-white">No Meal Currently Active</h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Dining hall doors are closed. When service begins, crowd inflow and automated tray replenishment warnings will activate automatically.
            </p>
          </Card>
        ) : (
          /* Open Meal Shift Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Occupancy & Kitchen Status */}
            <div className="space-y-4">
              <OccupancyHeadline snapshot={snapshot} />

              <TrayProgress
                trayCapacity={300} // Default or current meal capacity
                enteredSoFar={snapshot.occupancy.value}
              />

              <TrayCapacityForm
                currentCapacity={300}
                onUpdateCapacity={async (portions) => {
                  if (snapshot.mealId) {
                    await updateTrayCapacity(snapshot.mealId, portions);
                  }
                }}
              />
            </div>

            {/* Right Column: Alert Feed */}
            <div>
              <AlertFeed alerts={alerts} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
