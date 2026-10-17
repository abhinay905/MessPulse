import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useActiveSession } from './useActiveSession';
import * as httpModule from '../../../lib/http';
import { ApiError } from '../../../lib/errors';
import type { SessionDTO } from '@messpulse/shared';

vi.mock('../../../lib/http');

const mockSession: SessionDTO = {
  sessionId: 'sess-456',
  mealId: '20261017-lunch',
  checkedInAt: Date.now() - 60000,
  expectedStayEndsAt: Date.now() + 600000,
  hardExpiresAt: Date.now() + 1200000,
  geofence: 'inside',
};

describe('useActiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches active session on mount', async () => {
    vi.spyOn(httpModule, 'fetchApi').mockResolvedValue(mockSession);

    const { result } = renderHook(() => useActiveSession());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.session).toEqual(mockSession);
      expect(result.current.remainingSec).toBeGreaterThan(0);
    });
  });

  it('sets session to null when no active session exists', async () => {
    vi.spyOn(httpModule, 'fetchApi').mockResolvedValue(null);

    const { result } = renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.session).toBeNull();
      expect(result.current.remainingSec).toBe(0);
    });
  });

  it('handles 409 Conflict gracefully by fetching the existing active session', async () => {
    // 1st call on mount returns null
    // 2nd call (POST checkin) throws 409 Conflict
    // 3rd call (GET active) returns mockSession
    const fetchApiSpy = vi.spyOn(httpModule, 'fetchApi')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new ApiError(409, { code: 'ALREADY_CHECKED_IN', message: 'Already checked in' }))
      .mockResolvedValueOnce(mockSession);

    const { result } = renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let returnedSession: SessionDTO | undefined;
    await act(async () => {
      returnedSession = await result.current.checkIn('some-token');
    });

    expect(returnedSession).toEqual(mockSession);
    expect(result.current.session).toEqual(mockSession);
    expect(fetchApiSpy).toHaveBeenCalledTimes(3);
  });

  it('ends session via DELETE /api/v1/sessions/me/active', async () => {
    vi.spyOn(httpModule, 'fetchApi')
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce({});

    const { result } = renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(result.current.session).toEqual(mockSession);
    });

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.remainingSec).toBe(0);
  });
});
