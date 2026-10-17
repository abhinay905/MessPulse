/**
 * features/student/hooks/useLiveStatus.ts — live status fetch & socket subscription hook.
 * DOC3 §3.3.
 *
 * Responsibilities:
 * - Fetches initial status from REST GET /api/v1/mess/:messId/status
 * - Subscribes to realtime socket `status:update` events
 * - Manages connection state: 'connecting' | 'live' | 'reconnecting' | 'offline'
 * - Refetches on window visibilitychange (phone wake / tab switch)
 * - Exposes snapshot as-is. UI NEVER computes level, wait time, or decay.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StatusSnapshot } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';
import { subscribeToStatusUpdates } from '../../../lib/socket';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface UseLiveStatusResult {
  snapshot: StatusSnapshot | null;
  connection: ConnectionState;
  lastUpdatedAt: number | null;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLiveStatus(messId = 'mess-main-hall'): UseLiveStatusResult {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchApi<StatusSnapshot>(`/api/v1/mess/${messId}/status`);
      if (isMountedRef.current) {
        setSnapshot(data);
        setLastUpdatedAt(Date.now());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      }
    }
  }, [messId]);

  // Initial fetch and socket subscription
  useEffect(() => {
    isMountedRef.current = true;

    // 1. Fetch initial snapshot
    fetchStatus();

    // 2. Subscribe to socket updates
    const unsubscribe = subscribeToStatusUpdates(
      (newSnapshot) => {
        if (isMountedRef.current) {
          setSnapshot(newSnapshot);
          setLastUpdatedAt(Date.now());
          setConnection('live');
        }
      },
      (socketConnectionState) => {
        if (isMountedRef.current) {
          setConnection(socketConnectionState);
        }
      }
    );

    // 3. Handle tab focus / phone wake (DOC3 §3.3)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Handle browser online/offline
    const handleOnline = () => {
      setConnection('connecting');
      fetchStatus();
    };
    const handleOffline = () => {
      setConnection('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchStatus]);

  return {
    snapshot,
    connection,
    lastUpdatedAt,
    error,
    refetch: fetchStatus,
  };
}
