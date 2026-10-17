/**
 * features/admin/hooks/useTimeSeries.ts — Hook for occupancy & session time series history.
 * DOC3 §3.7.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TimeSeriesPoint } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';

export type TimeRangePreset = '1h' | '6h' | '24h' | '7d';

export interface UseTimeSeriesResult {
  data: TimeSeriesPoint[];
  range: TimeRangePreset;
  setRange: (r: TimeRangePreset) => void;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTimeSeries(messId: string = 'mess-main-hall'): UseTimeSeriesResult {
  const [data, setData] = useState<TimeSeriesPoint[]>([]);
  const [range, setRange] = useState<TimeRangePreset>('1h');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const now = Date.now();
    let durationMs = 60 * 60 * 1000; // 1h
    if (range === '6h') durationMs = 6 * 60 * 60 * 1000;
    if (range === '24h') durationMs = 24 * 60 * 60 * 1000;
    if (range === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;

    const from = now - durationMs;
    const to = now;

    try {
      const points = await fetchApi<TimeSeriesPoint[]>(
        `/api/v1/admin/mess/${messId}/timeseries`,
        {
          params: { from, to, maxPoints: 200 },
        }
      );
      setData(points);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeseries');
    } finally {
      setIsLoading(false);
    }
  }, [messId, range]);

  useEffect(() => {
    void fetchSeries();
  }, [fetchSeries]);

  return {
    data,
    range,
    setRange,
    isLoading,
    error,
    refetch: fetchSeries,
  };
}
