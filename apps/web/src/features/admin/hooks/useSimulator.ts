/**
 * features/admin/hooks/useSimulator.ts — Hook for controlling the demo lunch rush simulator.
 * DOC3 §3.9.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SimulatorStatus, SimulatorStartInput } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';

export interface UseSimulatorResult {
  status: SimulatorStatus | null;
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;
  start: (opts?: Partial<SimulatorStartInput>) => Promise<boolean>;
  stop: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useSimulator(): UseSimulatorResult {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await fetchApi<SimulatorStatus>('/api/v1/admin/simulator/status');
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query simulator status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Poll simulator status every 2.5s when active
  useEffect(() => {
    if (!status?.running) return;

    const interval = setInterval(() => {
      void fetchStatus();
    }, 2500);

    return () => clearInterval(interval);
  }, [status?.running, fetchStatus]);

  const start = async (opts: Partial<SimulatorStartInput> = {}): Promise<boolean> => {
    setIsActionLoading(true);
    setError(null);

    try {
      await fetchApi('/api/v1/admin/simulator/start', {
        method: 'POST',
        body: JSON.stringify({
          speed: opts.speed ?? 6,
          peakPeople: opts.peakPeople ?? 220,
          durationMin: opts.durationMin ?? 18,
          appAdoption: opts.appAdoption ?? 0.7,
          seed: opts.seed ?? 42,
        }),
      });
      await fetchStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start simulator');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const stop = async (): Promise<boolean> => {
    setIsActionLoading(true);
    setError(null);

    try {
      await fetchApi('/api/v1/admin/simulator/stop', {
        method: 'POST',
      });
      await fetchStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop simulator');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  return {
    status,
    isLoading,
    isActionLoading,
    error,
    start,
    stop,
    refetch: fetchStatus,
  };
}
