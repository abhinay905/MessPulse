import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StudentPage } from './StudentPage';
import type { StatusSnapshot } from '@messpulse/shared';
import * as useLiveStatusModule from './hooks/useLiveStatus';
import * as useAuthModule from '../auth/useAuth';

vi.mock('./hooks/useLiveStatus');
vi.mock('../auth/useAuth');
vi.mock('./hooks/useActiveSession', () => ({
  useActiveSession: () => ({
    session: null,
    isLoading: false,
    remainingSec: 0,
    checkIn: vi.fn(),
    endSession: vi.fn(),
    refetch: vi.fn(),
  }),
}));

const mockSnapshot: StatusSnapshot = {
  messId: 'mess-main-hall',
  mealId: '20261017-lunch',
  ts: Date.now(),
  state: 'open',
  occupancy: {
    value: 75,
    capacity: 200,
    level: 'low',
    source: 'camera',
    stale: false,
  },
  waitMin: 0,
  waitRangeMin: [0, 0],
  activeSessions: 30,
  decayWeightedSessions: 26,
  bestWindows: [
    { startsAt: Date.now() + 600000, endsAt: Date.now() + 1200000, expectedLevel: 'low', estWaitMin: 2 },
  ],
  camera: {
    lastSeenAt: Date.now(),
    stale: false,
  },
};

describe('StudentPage', () => {
  const mockLogout = vi.fn();
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'std-1', email: 'student@college.edu', role: 'student' },
      token: 'mock-token',
      isLoading: false,
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
      loginStaff: vi.fn(),
      logout: mockLogout,
    });
  });

  it('renders live open state with gauge, wait card, and best windows', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetch,
    });

    render(<StudentPage />);

    expect(screen.getByText('MessPulse')).toBeInTheDocument();
    expect(screen.getByText('mess-main-hall')).toBeInTheDocument();
    expect(screen.getByText('20261017-lunch')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('No wait')).toBeInTheDocument();
    expect(screen.getByText(/Best Arrival Windows/i)).toBeInTheDocument();
  });

  it('renders "Mess is currently closed" when state is closed', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: {
        ...mockSnapshot,
        state: 'closed',
        mealId: null,
      },
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetch,
    });

    render(<StudentPage />);

    expect(screen.getByText(/Mess is currently closed/i)).toBeInTheDocument();
    expect(screen.queryByText(/of 200 seated/i)).not.toBeInTheDocument();
  });

  it('displays reconnecting banner when connection is reconnecting', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'reconnecting',
      lastUpdatedAt: Date.now() - 15000,
      error: null,
      refetch: mockRefetch,
    });

    render(<StudentPage />);

    expect(screen.getByText(/Reconnecting to live feed…/i)).toBeInTheDocument();
  });
});
