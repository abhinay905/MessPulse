/**
 * features/admin/hooks/useCheckInQr.ts — Hook for generating check-in QR token & url.
 * DOC3 §3.7, DOC4 Step 14.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CheckinTokenResponse } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';

export interface UseCheckInQrResult {
  qrData: CheckinTokenResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCheckInQr(mealId?: string | null): UseCheckInQrResult {
  const [qrData, setQrData] = useState<CheckinTokenResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    if (!mealId) {
      setQrData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resp = await fetchApi<CheckinTokenResponse>(
        `/api/v1/admin/meals/${mealId}/checkin-token`
      );
      setQrData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR token');
    } finally {
      setIsLoading(false);
    }
  }, [mealId]);

  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  return {
    qrData,
    isLoading,
    error,
    refetch: fetchToken,
  };
}
