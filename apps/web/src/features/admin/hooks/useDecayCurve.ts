/**
 * features/admin/hooks/useDecayCurve.ts — Hook for theoretical decay curve and live session histogram.
 * DOC3 §3.7.
 */

import { useState, useEffect, useCallback } from 'react';
import type { DecayCurveResponse } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';

export interface UseDecayCurveResult {
  data: DecayCurveResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDecayCurve(messId: string = 'mess-main-hall'): UseDecayCurveResult {
  const [data, setData] = useState<DecayCurveResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurve = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const resp = await fetchApi<DecayCurveResponse>(
        `/api/v1/admin/mess/${messId}/decay-curve`
      );
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load decay curve');
    } finally {
      setIsLoading(false);
    }
  }, [messId]);

  useEffect(() => {
    void fetchCurve();
  }, [fetchCurve]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchCurve,
  };
}
