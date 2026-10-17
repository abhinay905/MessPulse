import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StaffPage } from './StaffPage';
import type { StatusSnapshot, AlertDTO } from '@messpulse/shared';
import * as useLiveStatusModule from '../student/hooks/useLiveStatus';
import * as useAuthModule from '../auth/useAuth';
import * as useAlertsModule from './hooks/useAlerts';
import * as useAlertSoundModule from './hooks/useAlertSound';

vi.mock('../student/hooks/useLiveStatus');
vi.mock('../auth/useAuth');
vi.mock('./hooks/useAlerts');
vi.mock('./hooks/useAlertSound');

const mockSnapshot: StatusSnapshot = {
  messId: 'mess-main-hall',
  mealId: '20261017-lunch',
  ts: Date.now(),
  state: 'open',
  occupancy: {
    value: 65,
    capacity: 200,
    level: 'medium',
    source: 'camera',
    stale: false,
  },
  waitMin: 3,
  waitRangeMin: [2, 5],
  activeSessions: 25,
  decayWeightedSessions: 22,
  bestWindows: [],
  camera: {
    lastSeenAt: Date.now(),
    stale: false,
  },
};

describe('StaffPage', () => {
  const mockLogout = vi.fn();
  const mockRefetchStatus = vi.fn();
  const mockRefetchAlerts = vi.fn();
  const mockAckAlert = vi.fn();
  const mockUpdateTrayCapacity = vi.fn();
  const mockEnableSound = vi.fn();
  const mockPlayChime = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'staff-1', email: 'cook@college.edu', role: 'staff' },
      token: 'mock-staff-token',
      isLoading: false,
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
      loginStaff: vi.fn(),
      logout: mockLogout,
    });

    vi.spyOn(useAlertSoundModule, 'useAlertSound').mockReturnValue({
      isSoundEnabled: false,
      enableSound: mockEnableSound,
      playChime: mockPlayChime,
    });
  });

  it('renders calm state with no open alerts and sound disabled', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetchStatus,
    });

    vi.spyOn(useAlertsModule, 'useAlerts').mockReturnValue({
      alerts: [],
      openAlerts: [],
      isLoading: false,
      ackAlert: mockAckAlert,
      updateTrayCapacity: mockUpdateTrayCapacity,
      refetch: mockRefetchAlerts,
    });

    render(<StaffPage />);

    expect(screen.getByText('Staff Controller')).toBeInTheDocument();
    expect(screen.getByText('STAFF')).toBeInTheDocument();
    expect(screen.getByText('mess-main-hall')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable sound/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Active Alert/i })).not.toBeInTheDocument();
    expect(screen.getByText('Dining Hall Floor')).toBeInTheDocument();
    expect(screen.getByText('Alert Activity Feed')).toBeInTheDocument();
  });

  it('displays AlertBanner when there are open alerts and allows 1-tap ack', async () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetchStatus,
    });

    const openAlert: AlertDTO = {
      id: 'alert-1',
      ruleId: 'tray-depletion',
      severity: 'warning',
      mealId: '20261017-lunch',
      message: 'Tray depletion reaching critical pace: 88% consumed.',
      raisedAt: Date.now() - 30000,
    };

    vi.spyOn(useAlertsModule, 'useAlerts').mockReturnValue({
      alerts: [openAlert],
      openAlerts: [openAlert],
      isLoading: false,
      ackAlert: mockAckAlert,
      updateTrayCapacity: mockUpdateTrayCapacity,
      refetch: mockRefetchAlerts,
    });

    render(<StaffPage />);

    const alertMatches = screen.getAllByText('Tray depletion reaching critical pace: 88% consumed.');
    expect(alertMatches.length).toBeGreaterThanOrEqual(1);

    const ackBtn = screen.getByRole('button', { name: /Acknowledge/i });
    expect(ackBtn).toBeInTheDocument();

    fireEvent.click(ackBtn);
    await waitFor(() => {
      expect(mockAckAlert).toHaveBeenCalledWith('alert-1');
    });
  });

  it('enables sound when clicking sound toggle', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetchStatus,
    });

    vi.spyOn(useAlertsModule, 'useAlerts').mockReturnValue({
      alerts: [],
      openAlerts: [],
      isLoading: false,
      ackAlert: mockAckAlert,
      updateTrayCapacity: mockUpdateTrayCapacity,
      refetch: mockRefetchAlerts,
    });

    render(<StaffPage />);

    const soundBtn = screen.getByRole('button', { name: /Enable sound/i });
    fireEvent.click(soundBtn);
    expect(mockEnableSound).toHaveBeenCalled();
  });

  it('renders closed state when mess snapshot state is closed', () => {
    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: { ...mockSnapshot, state: 'closed', mealId: null },
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetchStatus,
    });

    vi.spyOn(useAlertsModule, 'useAlerts').mockReturnValue({
      alerts: [],
      openAlerts: [],
      isLoading: false,
      ackAlert: mockAckAlert,
      updateTrayCapacity: mockUpdateTrayCapacity,
      refetch: mockRefetchAlerts,
    });

    render(<StaffPage />);

    expect(screen.getByText('No Meal Currently Active')).toBeInTheDocument();
    expect(screen.queryByText('Dining Hall Floor')).not.toBeInTheDocument();
  });
});
