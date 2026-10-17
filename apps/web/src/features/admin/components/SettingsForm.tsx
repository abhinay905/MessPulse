/**
 * features/admin/components/SettingsForm.tsx — Admin mess hall configuration editor.
 * DOC3 §3.7, DOC4 Step 14.
 */

import React, { useState, useEffect } from 'react';
import { Sliders, Save, Check, AlertCircle, RefreshCw } from 'lucide-react';
import type { SettingsDTO, SettingsPatch } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface SettingsFormProps {
  settings: SettingsDTO | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  isConflict: boolean;
  onUpdate: (patch: SettingsPatch) => Promise<boolean>;
  onReload: () => Promise<void>;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({
  settings,
  isLoading,
  isSaving,
  error,
  fieldErrors,
  isConflict,
  onUpdate,
  onReload,
}) => {
  const [capacity, setCapacity] = useState<string>('200');
  const [servicePerMin, setServicePerMin] = useState<string>('12');
  const [demandFactor, setDemandFactor] = useState<string>('0');
  const [baseMealMin, setBaseMealMin] = useState<string>('18');
  const [maxSessionMin, setMaxSessionMin] = useState<string>('60');
  const [staleCameraSec, setStaleCameraSec] = useState<string>('30');
  const [alertCooldownSec, setAlertCooldownSec] = useState<string>('180');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setCapacity(String(settings.capacity));
      setServicePerMin(String(settings.servicePerMin));
      setDemandFactor(String(settings.demandFactor));
      setBaseMealMin(String(settings.baseMealMin));
      setMaxSessionMin(String(settings.maxSessionMin));
      setStaleCameraSec(String(settings.staleCameraSec));
      setAlertCooldownSec(String(settings.alertCooldownSec));
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);

    const patch: SettingsPatch = {
      capacity: parseInt(capacity, 10),
      servicePerMin: parseFloat(servicePerMin),
      demandFactor: parseInt(demandFactor, 10),
      baseMealMin: parseInt(baseMealMin, 10),
      maxSessionMin: parseInt(maxSessionMin, 10),
      staleCameraSec: parseInt(staleCameraSec, 10),
      alertCooldownSec: parseInt(alertCooldownSec, 10),
    };

    const success = await onUpdate(patch);
    if (success) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  if (isLoading && !settings) {
    return (
      <Card className="p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-slate-800 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-14 bg-slate-900 rounded" />
          <div className="h-14 bg-slate-900 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-brand-400" />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Dining Hall Operations & Calibration
            </h2>
            <p className="text-xs text-slate-400">
              Changes take effect on the next 1 s occupancy tick. Active diner sessions remain immutable.
            </p>
          </div>
        </div>

        {savedSuccess && (
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
            <Check className="w-4 h-4" /> Settings Saved
          </span>
        )}
      </div>

      {isConflict && (
        <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Settings were modified by another administrator. Please reload to avoid overwriting.</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void onReload()} className="text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Reload
          </Button>
        </div>
      )}

      {error && !isConflict && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Capacity */}
          <div className="space-y-1">
            <label htmlFor="capacity" className="text-xs font-semibold text-slate-300 block">
              Seating Capacity (Max Hall Seats)
            </label>
            <input
              id="capacity"
              data-testid="input-capacity"
              type="number"
              min={10}
              max={2000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['capacity'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['capacity']}</p>
            )}
          </div>

          {/* Service Rate */}
          <div className="space-y-1">
            <label htmlFor="servicePerMin" className="text-xs font-semibold text-slate-300 block">
              Service Flow Rate (Students Served / Min)
            </label>
            <input
              id="servicePerMin"
              data-testid="input-service-rate"
              type="number"
              min={1}
              max={100}
              step={0.5}
              value={servicePerMin}
              onChange={(e) => setServicePerMin(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['servicePerMin'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['servicePerMin']}</p>
            )}
          </div>

          {/* Demand Factor */}
          <div className="space-y-1">
            <label htmlFor="demandFactor" className="text-xs font-semibold text-slate-300 block">
              Menu Demand Factor (+0 to 5 Extra Min Dwell)
            </label>
            <input
              id="demandFactor"
              data-testid="input-demand-factor"
              type="number"
              min={0}
              max={5}
              value={demandFactor}
              onChange={(e) => setDemandFactor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['demandFactor'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['demandFactor']}</p>
            )}
          </div>

          {/* Base Meal Stay Duration */}
          <div className="space-y-1">
            <label htmlFor="baseMealMin" className="text-xs font-semibold text-slate-300 block">
              Base Meal Stay Duration (Min)
            </label>
            <input
              id="baseMealMin"
              data-testid="input-base-meal"
              type="number"
              min={5}
              max={60}
              value={baseMealMin}
              onChange={(e) => setBaseMealMin(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['baseMealMin'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['baseMealMin']}</p>
            )}
          </div>

          {/* Max Session Duration */}
          <div className="space-y-1">
            <label htmlFor="maxSessionMin" className="text-xs font-semibold text-slate-300 block">
              Max Session Hard Expiry (Min)
            </label>
            <input
              id="maxSessionMin"
              data-testid="input-max-session"
              type="number"
              min={20}
              max={180}
              value={maxSessionMin}
              onChange={(e) => setMaxSessionMin(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['maxSessionMin'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['maxSessionMin']}</p>
            )}
          </div>

          {/* Stale Camera Threshold */}
          <div className="space-y-1">
            <label htmlFor="staleCameraSec" className="text-xs font-semibold text-slate-300 block">
              Stale Camera Threshold (Sec)
            </label>
            <input
              id="staleCameraSec"
              data-testid="input-stale-camera"
              type="number"
              min={10}
              max={300}
              value={staleCameraSec}
              onChange={(e) => setStaleCameraSec(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors['staleCameraSec'] && (
              <p className="text-[11px] text-rose-400">{fieldErrors['staleCameraSec']}</p>
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            type="submit"
            data-testid="save-settings-btn"
            isLoading={isSaving}
            leftIcon={<Save className="w-3.5 h-3.5" />}
            className="text-xs font-semibold"
          >
            Save Operations Settings
          </Button>
        </div>
      </form>
    </Card>
  );
};
