/**
 * features/staff/hooks/useAlerts.ts — Staff alerts state and realtime gateway listener.
 * DOC3 §3.6.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlertDTO } from '@messpulse/shared';
import { SocketEvents } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';
import { getSocket } from '../../../lib/socket';

export interface UseAlertsOptions {
  onAlertRaised?: (alert: AlertDTO) => void;
}

export interface UseAlertsResult {
  alerts: AlertDTO[];
  openAlerts: AlertDTO[];
  isLoading: boolean;
  ackAlert: (alertId: string) => Promise<void>;
  updateTrayCapacity: (mealId: string, capacityPortions: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAlerts(options: UseAlertsOptions = {}): UseAlertsResult {
  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isMountedRef = useRef(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await fetchApi<AlertDTO[]>('/api/v1/staff/alerts');
      if (isMountedRef.current) {
        setAlerts(data);
      }
    } catch {
      // Handled gracefully in UI
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchAlerts();

    const socket = getSocket();

    const handleRaised = (newAlert: AlertDTO) => {
      setAlerts((prev) => {
        const existingIdx = prev.findIndex((a) => a.id === newAlert.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = newAlert;
          return updated;
        }
        return [newAlert, ...prev];
      });

      optionsRef.current.onAlertRaised?.(newAlert);
    };

    const handleCleared = (cleared: { id: string; clearedAt: number }) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === cleared.id ? { ...a, clearedAt: cleared.clearedAt } : a))
      );
    };

    socket.on(SocketEvents.AlertRaised, handleRaised);
    socket.on(SocketEvents.AlertCleared, handleCleared);

    return () => {
      isMountedRef.current = false;
      socket.off(SocketEvents.AlertRaised, handleRaised);
      socket.off(SocketEvents.AlertCleared, handleCleared);
    };
  }, [fetchAlerts]);

  const ackAlert = async (alertId: string): Promise<void> => {
    try {
      const updated = await fetchApi<AlertDTO>(`/api/v1/staff/alerts/${alertId}/ack`, {
        method: 'POST',
      });

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, ackedAt: updated.ackedAt } : a))
      );
    } catch (err) {
      throw err;
    }
  };

  const updateTrayCapacity = async (mealId: string, capacityPortions: number): Promise<void> => {
    await fetchApi<{ mealId: string; capacityPortions: number }>(
      `/api/v1/staff/meals/${mealId}/trays`,
      {
        method: 'PUT',
        body: JSON.stringify({ capacityPortions }),
      }
    );
    // Refresh alerts to reflect any immediate clearance
    await fetchAlerts();
  };

  const openAlerts = alerts.filter((a) => !a.clearedAt);

  return {
    alerts,
    openAlerts,
    isLoading,
    ackAlert,
    updateTrayCapacity,
    refetch: fetchAlerts,
  };
}
