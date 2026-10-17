import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminPage } from './AdminPage';
import type { StatusSnapshot } from '@messpulse/shared';
import * as useAuthModule from '../auth/useAuth';
import * as useLiveStatusModule from '../student/hooks/useLiveStatus';
import * as useSettingsModule from './hooks/useSettings';
import * as useTimeSeriesModule from './hooks/useTimeSeries';
import * as useDecayCurveModule from './hooks/useDecayCurve';
import * as useSimulatorModule from './hooks/useSimulator';
import * as useCheckInQrModule from './hooks/useCheckInQr';

vi.mock('../auth/useAuth');
vi.mock('../student/hooks/useLiveStatus');
vi.mock('./hooks/useSettings');
vi.mock('./hooks/useTimeSeries');
vi.mock('./hooks/useDecayCurve');
vi.mock('./hooks/useSimulator');
vi.mock('./hooks/useCheckInQr');

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

describe('AdminPage', () => {
  const mockLogout = vi.fn();
  const mockRefetchLiveStatus = vi.fn();
  const mockUpdateSettings = vi.fn();
  const mockRefetchSettings = vi.fn();
  const mockRefetchTimeSeries = vi.fn();
  const mockRefetchDecayCurve = vi.fn();
  const mockStartSim = vi.fn();
  const mockStopSim = vi.fn();
  const mockRefetchSim = vi.fn();
  const mockRefetchQr = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', email: 'admin@college.edu', role: 'admin' },
      token: 'mock-admin-jwt',
      isLoading: false,
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
      loginStaff: vi.fn(),
      logout: mockLogout,
    });

    vi.spyOn(useLiveStatusModule, 'useLiveStatus').mockReturnValue({
      snapshot: mockSnapshot,
      connection: 'live',
      lastUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetchLiveStatus,
    });

    vi.spyOn(useSettingsModule, 'useSettings').mockReturnValue({
      settings: {
        messId: 'mess-main-hall',
        capacity: 200,
        servicePerMin: 12,
        demandFactor: 0,
        baseMealMin: 18,
        maxSessionMin: 60,
        staleCameraSec: 30,
        alertCooldownSec: 180,
        updatedAt: 1700000000000,
      },
      isLoading: false,
      isSaving: false,
      error: null,
      fieldErrors: {},
      isConflict: false,
      updateSettings: mockUpdateSettings,
      refetch: mockRefetchSettings,
    });

    vi.spyOn(useTimeSeriesModule, 'useTimeSeries').mockReturnValue({
      data: [
        {
          ts: 1700000000000,
          camera: 80,
          sessionEstimate: 75,
          decayWeighted: 70,
          waitMin: 5,
        },
      ],
      range: '1h',
      setRange: vi.fn(),
      isLoading: false,
      error: null,
      refetch: mockRefetchTimeSeries,
    });

    vi.spyOn(useDecayCurveModule, 'useDecayCurve').mockReturnValue({
      data: {
        theoretical: [{ offsetMin: 0, weight: 1 }],
        liveHistogram: [{ bin: '0.8-1.0', count: 12 }],
        activeSessions: 12,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchDecayCurve,
    });

    vi.spyOn(useSimulatorModule, 'useSimulator').mockReturnValue({
      status: {
        running: false,
        runId: null,
        speed: null,
        simulatedElapsedMin: null,
        eventsRemaining: null,
        error: null,
      },
      isLoading: false,
      isActionLoading: false,
      error: null,
      start: mockStartSim,
      stop: mockStopSim,
      refetch: mockRefetchSim,
    });

    vi.spyOn(useCheckInQrModule, 'useCheckInQr').mockReturnValue({
      qrData: {
        token: 'signed-mock-token',
        url: 'http://localhost:5173/student/checkin?mealToken=signed-mock-token',
        expiresAt: Date.now() + 600000,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchQr,
    });
  });

  it('renders the Live Ops tab by default with simulator and QR controls', () => {
    render(<AdminPage />);

    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.getByTestId('live-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('simulator-controls')).toBeInTheDocument();
    expect(screen.getByTestId('checkin-qr')).toBeInTheDocument();
  });

  it('switches to Settings tab when clicked', () => {
    render(<AdminPage />);

    const settingsTabBtn = screen.getByTestId('tab-settings');
    fireEvent.click(settingsTabBtn);

    expect(screen.getByTestId('settings-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('input-capacity')).toHaveValue(200);
  });

  it('switches to Analytics tab and displays chart containers', async () => {
    render(<AdminPage />);

    const analyticsTabBtn = screen.getByTestId('tab-analytics');
    fireEvent.click(analyticsTabBtn);

    expect(screen.getByTestId('analytics-tab-content')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('occupancy-chart')).toBeInTheDocument();
      expect(screen.getByTestId('decay-curve-charts')).toBeInTheDocument();
    });
  });

  it('triggers logout when signout button is clicked', () => {
    render(<AdminPage />);

    const logoutBtn = screen.getByTitle('Sign out');
    fireEvent.click(logoutBtn);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
