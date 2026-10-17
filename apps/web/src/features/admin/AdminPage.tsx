/**
 * features/admin/AdminPage.tsx — MessPulse Administrator Dashboard.
 * DOC3 §3.7, DOC4 Step 14.
 *
 * Tabbed interface:
 * 1. Live: Camera health, Simulator controls, On-screen Check-in QR code.
 * 2. Analytics: Time-series occupancy & decay-weighted chart, Theoretical & active decay curve.
 *    (Lazy-loaded via React.lazy so Recharts is never bundled into student bundle)
 * 3. Settings: Dining hall capacity, service rate, session durations, thresholds.
 */

import React, { useState, Suspense } from 'react';
import {
  Sliders,
  BarChart3,
  Activity,
  LogOut,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useLiveStatus } from '../student/hooks/useLiveStatus';
import { useSettings } from './hooks/useSettings';
import { useTimeSeries } from './hooks/useTimeSeries';
import { useDecayCurve } from './hooks/useDecayCurve';
import { useSimulator } from './hooks/useSimulator';
import { useCheckInQr } from './hooks/useCheckInQr';

import { CameraHealthCard } from './components/CameraHealthCard';
import { SimulatorControls } from './components/SimulatorControls';
import { CheckInQr } from './components/CheckInQr';
import { SettingsForm } from './components/SettingsForm';
import { Button } from '../../components/ui/Button';

// Lazy load chart components to keep /student bundle lightweight (DOC4 Step 14 Done When #7)
const OccupancyChart = React.lazy(() => import('./components/OccupancyChart'));
const DecayCurveChart = React.lazy(() => import('./components/DecayCurveChart'));

type AdminTab = 'live' | 'analytics' | 'settings';

export const AdminPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('live');

  // Live status for camera telemetry & active meal
  const { snapshot, refetch: refetchLiveStatus } = useLiveStatus();

  // Settings hook
  const {
    settings,
    isLoading: settingsLoading,
    isSaving: settingsSaving,
    error: settingsError,
    fieldErrors,
    isConflict,
    updateSettings,
    refetch: refetchSettings,
  } = useSettings();

  // Historical time series hook
  const {
    data: timeSeriesData,
    range: timeSeriesRange,
    setRange: setTimeSeriesRange,
    isLoading: timeSeriesLoading,
    error: timeSeriesError,
    refetch: refetchTimeSeries,
  } = useTimeSeries();

  // Decay curve & distribution hook
  const {
    data: decayCurveData,
    isLoading: decayCurveLoading,
    error: decayCurveError,
    refetch: refetchDecayCurve,
  } = useDecayCurve();

  // Simulator controls hook
  const {
    status: simStatus,
    isLoading: simLoading,
    isActionLoading: simActionLoading,
    error: simError,
    start: startSimulator,
    stop: stopSimulator,
    refetch: refetchSimulator,
  } = useSimulator();

  // Check-in QR code hook
  const {
    qrData,
    isLoading: qrLoading,
    error: qrError,
    refetch: refetchQr,
  } = useCheckInQr(snapshot?.mealId);

  const handleGlobalRefresh = () => {
    void refetchLiveStatus();
    void refetchSettings();
    void refetchTimeSeries();
    void refetchDecayCurve();
    void refetchSimulator();
    void refetchQr();
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100" data-testid="admin-page">
      {/* Top Header */}
      <header className="w-full border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
                MessPulse <span className="text-indigo-400 text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">Admin</span>
              </h1>
              <p className="text-xs text-slate-400">Main Dining Hall Controller</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGlobalRefresh}
              className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs"
              title="Refresh all data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <div className="hidden sm:block text-right mr-1">
              <span className="text-xs font-medium text-slate-300 block">{user?.email || 'admin'}</span>
              <span className="text-[10px] text-slate-500 capitalize">{user?.role || 'admin'}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-slate-400 hover:text-red-400 hover:bg-red-950/20"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-4 flex gap-2 border-t border-slate-800/60 pt-1">
          <button
            type="button"
            data-testid="tab-live"
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'live'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Live Ops & QR
          </button>

          <button
            type="button"
            data-testid="tab-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'analytics'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics & Curves
          </button>

          <button
            type="button"
            data-testid="tab-settings"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Hall Settings
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* TAB 1: LIVE OPS */}
        {activeTab === 'live' && (
          <div className="space-y-6 animate-in fade-in duration-200" data-testid="live-tab-content">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CameraHealthCard snapshot={snapshot} />
              <SimulatorControls
                status={simStatus}
                isLoading={simLoading}
                isActionLoading={simActionLoading}
                onStart={startSimulator}
                onStop={stopSimulator}
              />
            </div>
            <div className="grid grid-cols-1 gap-6">
              <CheckInQr
                mealId={snapshot?.mealId}
                qrData={qrData}
                isLoading={qrLoading}
                error={qrError}
                onRefresh={refetchQr}
              />
            </div>
          </div>
        )}

        {/* TAB 2: ANALYTICS (LAZY LOADED RECHARTS) */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-200" data-testid="analytics-tab-content">
            <Suspense
              fallback={
                <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-sm">Loading dynamic charts…</span>
                </div>
              }
            >
              <OccupancyChart
                data={timeSeriesData}
                range={timeSeriesRange}
                setRange={setTimeSeriesRange}
                isLoading={timeSeriesLoading}
                error={timeSeriesError}
                onRefresh={refetchTimeSeries}
              />

              <DecayCurveChart
                data={decayCurveData}
                isLoading={decayCurveLoading}
                error={decayCurveError}
                onRefresh={refetchDecayCurve}
              />
            </Suspense>
          </div>
        )}

        {/* TAB 3: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in duration-200" data-testid="settings-tab-content">
            <SettingsForm
              settings={settings}
              isLoading={settingsLoading}
              isSaving={settingsSaving}
              error={settingsError}
              fieldErrors={fieldErrors}
              isConflict={isConflict}
              onUpdate={updateSettings}
              onReload={refetchSettings}
            />
          </div>
        )}
      </main>
    </div>
  );
};
export default AdminPage;
