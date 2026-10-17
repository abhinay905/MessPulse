import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentLocation } from './geolocation';

describe('geolocation', () => {
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
      writable: true,
    });
  });

  it('returns undefined when geolocation is not supported', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const res = await getCurrentLocation(1000);
    expect(res).toBeUndefined();
  });

  it('returns coords on successful position retrieval', async () => {
    const mockGetCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 12,
        },
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const promise = getCurrentLocation(2000);
    const res = await promise;

    expect(res).toEqual({
      lat: 12.9716,
      lng: 77.5946,
      accuracyM: 12,
    });
  });

  it('returns undefined on permission denial or position error without throwing', async () => {
    const mockGetCurrentPosition = vi.fn((_success, error) => {
      error({
        code: 1, // PERMISSION_DENIED
        message: 'User denied Geolocation',
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const promise = getCurrentLocation(2000);
    const res = await promise;

    expect(res).toBeUndefined();
  });

  it('times out after specified timeout and resolves undefined', async () => {
    const mockGetCurrentPosition = vi.fn(() => {
      // Never calls success or error
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const promise = getCurrentLocation(5000);
    vi.advanceTimersByTime(5100);
    const res = await promise;

    expect(res).toBeUndefined();
  });
});
