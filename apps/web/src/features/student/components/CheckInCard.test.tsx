import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckInCard } from './CheckInCard';
import * as useActiveSessionModule from '../hooks/useActiveSession';
import * as geolocationModule from '../../../lib/geolocation';
import type { SessionDTO } from '@messpulse/shared';

vi.mock('../hooks/useActiveSession');
vi.mock('../../../lib/geolocation');

const mockActiveSession: SessionDTO = {
  sessionId: 'sess-123',
  mealId: '20261017-lunch',
  checkedInAt: Date.now() - 300000,
  expectedStayEndsAt: Date.now() + 600000, // 10 mins remaining
  hardExpiresAt: Date.now() + 1200000,
  geofence: 'inside',
};

describe('CheckInCard', () => {
  const mockCheckIn = vi.fn();
  const mockEndSession = vi.fn();
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(geolocationModule, 'getCurrentLocation').mockResolvedValue({
      lat: 12.9716,
      lng: 77.5946,
      accuracyM: 20,
    });
  });

  it('renders idle state with token input and check in button when no session is active', () => {
    vi.spyOn(useActiveSessionModule, 'useActiveSession').mockReturnValue({
      session: null,
      isLoading: false,
      remainingSec: 0,
      checkIn: mockCheckIn,
      endSession: mockEndSession,
      refetch: mockRefetch,
    });

    render(<CheckInCard />);

    expect(screen.getByText('Meal Check-In')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste meal token/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check In/i })).toBeDisabled();
  });

  it('submits manual token on form submit', async () => {
    vi.spyOn(useActiveSessionModule, 'useActiveSession').mockReturnValue({
      session: null,
      isLoading: false,
      remainingSec: 0,
      checkIn: mockCheckIn.mockResolvedValue(mockActiveSession),
      endSession: mockEndSession,
      refetch: mockRefetch,
    });

    render(<CheckInCard />);

    const input = screen.getByPlaceholderText(/Paste meal token/i);
    fireEvent.change(input, { target: { value: 'test-meal-jwt' } });

    const submitBtn = screen.getByRole('button', { name: /Check In/i });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith('test-meal-jwt', {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 20,
      });
    });
  });

  it('renders active state with countdown and handles "I\'m Done Eating"', async () => {
    vi.spyOn(useActiveSessionModule, 'useActiveSession').mockReturnValue({
      session: mockActiveSession,
      isLoading: false,
      remainingSec: 600,
      checkIn: mockCheckIn,
      endSession: mockEndSession.mockResolvedValue(undefined),
      refetch: mockRefetch,
    });

    render(<CheckInCard />);

    expect(screen.getByText(/Active Meal Session/i)).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText(/In Mess Hall/i)).toBeInTheDocument();

    const endBtn = screen.getByRole('button', { name: /I'm Done Eating/i });
    fireEvent.click(endBtn);

    await waitFor(() => {
      expect(mockEndSession).toHaveBeenCalledTimes(1);
    });
  });

  it('auto-triggers check-in when initialToken prop is supplied', async () => {
    vi.spyOn(useActiveSessionModule, 'useActiveSession').mockReturnValue({
      session: null,
      isLoading: false,
      remainingSec: 0,
      checkIn: mockCheckIn.mockResolvedValue(mockActiveSession),
      endSession: mockEndSession,
      refetch: mockRefetch,
    });

    render(<CheckInCard initialToken="url-token-from-qr" />);

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith('url-token-from-qr', {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 20,
      });
    });
  });

  it('displays error state and allows retry on checkIn failure', async () => {
    vi.spyOn(useActiveSessionModule, 'useActiveSession').mockReturnValue({
      session: null,
      isLoading: false,
      remainingSec: 0,
      checkIn: mockCheckIn.mockRejectedValue(new Error('This QR code has expired')),
      endSession: mockEndSession,
      refetch: mockRefetch,
    });

    render(<CheckInCard initialToken="expired-token" />);

    await waitFor(() => {
      expect(screen.getByText(/Check-In Failed/i)).toBeInTheDocument();
      expect(screen.getByText(/This QR code has expired/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(retryBtn);

    expect(screen.getByText('Meal Check-In')).toBeInTheDocument();
  });
});
