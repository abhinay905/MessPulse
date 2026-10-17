/**
 * features/student/hooks/useActiveSession.ts — student check-in session state and countdown.
 * DOC3 §3.4.
 *
 * Enforces:
 * - Single active session per student
 * - Countdown until expectedStayEndsAt
 * - Graceful handling of 409 ALREADY_CHECKED_IN (treats as success and fetches session)
 * - "I'm done" early termination via DELETE /api/v1/sessions/me/active
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionDTO } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';
import { ApiError } from '../../../lib/errors';
import type { GeoLocationResult } from '../../../lib/geolocation';

export interface UseActiveSessionResult {
  session: SessionDTO | null;
  isLoading: boolean;
  remainingSec: number;
  checkIn: (mealToken: string, geo?: GeoLocationResult) => Promise<SessionDTO>;
  endSession: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useActiveSession(): UseActiveSessionResult {
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const isMountedRef = useRef(true);

  const fetchActive = useCallback(async () => {
    try {
      const data = await fetchApi<SessionDTO | null>('/api/v1/sessions/me/active');
      if (isMountedRef.current) {
        setSession(data ?? null);
      }
    } catch {
      if (isMountedRef.current) {
        setSession(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchActive();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchActive]);

  // Countdown timer for active session
  useEffect(() => {
    if (!session) {
      setRemainingSec(0);
      return;
    }

    const updateRemaining = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((session.expectedStayEndsAt - now) / 1000));
      setRemainingSec(diffSec);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const checkIn = async (mealToken: string, geo?: GeoLocationResult): Promise<SessionDTO> => {
    try {
      const newSession = await fetchApi<SessionDTO>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({ mealToken, geo }),
      });

      if (isMountedRef.current) {
        setSession(newSession);
      }
      return newSession;
    } catch (err) {
      // If already checked in (409), treat as success and reload the active session (DOC3 §3.4)
      if (err instanceof ApiError && (err.code === 'ALREADY_CHECKED_IN' || err.httpStatus === 409)) {
        const active = await fetchApi<SessionDTO | null>('/api/v1/sessions/me/active');
        if (active) {
          if (isMountedRef.current) {
            setSession(active);
          }
          return active;
        }
      }
      throw err;
    }
  };

  const endSession = async (): Promise<void> => {
    try {
      await fetchApi('/api/v1/sessions/me/active', {
        method: 'DELETE',
      });
    } catch {
      // idempotent delete
    } finally {
      if (isMountedRef.current) {
        setSession(null);
        setRemainingSec(0);
      }
    }
  };

  return {
    session,
    isLoading,
    remainingSec,
    checkIn,
    endSession,
    refetch: fetchActive,
  };
}
