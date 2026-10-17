/**
 * features/optouts/OptOutToggle.tsx — Toggle switch for student advance opt-out.
 * DOC3 §3.13, DOC4 Step 17.
 * Designed for phone viewports with min 44px touch targets.
 */

import React from 'react';
import { Utensils, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { useOptOut } from './hooks/useOptOut';
import { ApiError } from '../../lib/errors';

interface OptOutToggleProps {
  mealId: string | null;
}

export const OptOutToggle: React.FC<OptOutToggleProps> = ({ mealId }) => {
  const { optedOut, cutoffAt, isLoading, isUpdating, error, toggleOptOut } = useOptOut(mealId);

  if (!mealId) return null;

  const now = Date.now();
  const isCutoffPassed = cutoffAt > 0 && now >= cutoffAt;
  const cutoffTimeStr = cutoffAt > 0
    ? new Date(cutoffAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const errorMessage = error instanceof ApiError
    ? error.code === 'OPTOUT_WINDOW_CLOSED'
      ? 'Opt-out window is closed for this meal.'
      : error.message
    : error
    ? 'Failed to update opt-out status'
    : null;

  return (
    <Card elevated className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              optedOut
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-slate-800 text-slate-400 border border-slate-700/50'
            }`}
          >
            {optedOut ? <CheckCircle2 className="w-5 h-5" /> : <Utensils className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              Skipping this meal?
            </h3>
            <p className="text-[11px] text-slate-400">
              {optedOut
                ? "You've marked yourself as skipping"
                : 'Help the kitchen reduce food waste'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={optedOut}
          disabled={isLoading || isUpdating || isCutoffPassed}
          onClick={toggleOptOut}
          aria-label={optedOut ? 'Cancel meal opt-out' : 'Opt out of meal'}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed ${
            optedOut ? 'bg-amber-500' : 'bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              optedOut ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {cutoffTimeStr && (
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Cutoff deadline:
          </span>
          <span className={`font-mono font-medium ${isCutoffPassed ? 'text-rose-400' : 'text-slate-300'}`}>
            {cutoffTimeStr} {isCutoffPassed && '(Closed)'}
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="mt-2.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </Card>
  );
};
