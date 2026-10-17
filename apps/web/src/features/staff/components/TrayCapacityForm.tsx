/**
 * features/staff/components/TrayCapacityForm.tsx — Set or refill meal tray portions.
 * DOC3 §3.6.
 */

import React, { useState } from 'react';
import { Layers, PlusCircle, Check } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface TrayCapacityFormProps {
  currentCapacity?: number | undefined;
  onUpdateCapacity: (portions: number) => Promise<void>;
}

export const TrayCapacityForm: React.FC<TrayCapacityFormProps> = ({
  currentCapacity,
  onUpdateCapacity,
}) => {
  const [portions, setPortions] = useState<string>(
    currentCapacity ? String(currentCapacity) : ''
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(false);

    const val = parseInt(portions, 10);
    if (isNaN(val) || val <= 0 || val > 10000) {
      setError('Please enter a valid quantity between 1 and 10,000 portions.');
      return;
    }

    setIsLoading(true);
    try {
      await onUpdateCapacity(val);
      setSuccessNotice(true);
      setTimeout(() => setSuccessNotice(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update capacity');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAdd = (addPortions: number) => {
    const current = parseInt(portions, 10) || 0;
    setPortions(String(Math.min(10000, current + addPortions)));
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            {currentCapacity ? 'Update / Refill Trays' : 'Initialize Tray Capacity'}
          </h2>
        </div>
        {successNotice && (
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
            <Check className="w-3.5 h-3.5" /> Saved & Evaluated
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            placeholder="e.g. 250 portions"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <Button
            type="submit"
            size="sm"
            isLoading={isLoading}
            className="text-xs shrink-0 font-medium"
          >
            {currentCapacity ? 'Save Refill' : 'Set Capacity'}
          </Button>
        </div>

        {error && <p className="text-[11px] text-rose-400">{error}</p>}

        {/* Quick Add Refill Buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[10px] text-slate-400 font-medium uppercase">Quick add:</span>
          {[50, 100, 200].map((add) => (
            <button
              key={add}
              type="button"
              onClick={() => handleQuickAdd(add)}
              className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors flex items-center gap-1"
            >
              <PlusCircle className="w-2.5 h-2.5 text-brand-400" /> +{add}
            </button>
          ))}
        </div>
      </form>
    </Card>
  );
};
