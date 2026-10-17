import { describe, expect, it } from 'vitest';
import {
  evaluateGeofence,
  haversineDistanceM,
  type FenceArea,
  type GeoPoint,
} from './geofence';

describe('geofence domain logic', () => {
  const messFence: FenceArea = {
    lat: 12.9716, // Bangalore coordinates for realistic testing
    lng: 77.5946,
    radiusM: 100,
  };

  describe('evaluateGeofence', () => {
    it('returns unknown when geo is undefined', () => {
      expect(evaluateGeofence(undefined, messFence)).toBe('unknown');
    });

    it.each<[string, unknown]>([
      ['missing lat', { lng: 77.5946, accuracyM: 20 }],
      ['missing lng', { lat: 12.9716, accuracyM: 20 }],
      ['missing accuracyM', { lat: 12.9716, lng: 77.5946 }],
      ['string lat', { lat: '12.9716', lng: 77.5946, accuracyM: 20 }],
      ['string lng', { lat: 12.9716, lng: '77.5946', accuracyM: 20 }],
      ['string accuracyM', { lat: 12.9716, lng: 77.5946, accuracyM: '20' }],
    ])('returns unknown when geo has %s', (_desc, invalidGeo) => {
      expect(evaluateGeofence(invalidGeo as GeoPoint, messFence)).toBe('unknown');
    });

    it('returns unknown when accuracy > 150m (poor indoor GPS)', () => {
      const geo: GeoPoint = {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 151,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('unknown');
    });

    it('returns unknown when accuracy < 0', () => {
      const geo: GeoPoint = {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: -5,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('unknown');
    });

    it('returns inside when user is at exact mess center with good accuracy', () => {
      const geo: GeoPoint = {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 10,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('inside');
    });

    it('returns inside when user is within fence radius (50m away, radius 100m)', () => {
      // 0.0004 deg lat is ~44.5 meters
      const geo: GeoPoint = {
        lat: 12.972,
        lng: 77.5946,
        accuracyM: 20,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('inside');
    });

    it('returns inside when distance exactly equals radius', () => {
      // A small circle with 100m radius
      const d = haversineDistanceM(12.9716, 77.5946, 12.972, 77.5946);
      const exactFence: FenceArea = {
        lat: 12.9716,
        lng: 77.5946,
        radiusM: d,
      };
      const geo: GeoPoint = {
        lat: 12.972,
        lng: 77.5946,
        accuracyM: 50,
      };
      expect(evaluateGeofence(geo, exactFence)).toBe('inside');
    });

    it('returns outside when user is beyond fence radius (>100m)', () => {
      // 0.002 deg lat is ~222 meters
      const geo: GeoPoint = {
        lat: 12.9736,
        lng: 77.5946,
        accuracyM: 15,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('outside');
    });

    it('accepts accuracy of exactly 150m', () => {
      const geo: GeoPoint = {
        lat: 12.9716,
        lng: 77.5946,
        accuracyM: 150,
      };
      expect(evaluateGeofence(geo, messFence)).toBe('inside');
    });
  });

  describe('haversineDistanceM', () => {
    it('returns 0 for identical points', () => {
      expect(haversineDistanceM(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
    });

    it('calculates accurate distance between known coordinates', () => {
      // London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ~ 343.56 km
      const dist = haversineDistanceM(51.5074, -0.1278, 48.8566, 2.3522);
      expect(dist / 1000).toBeCloseTo(343.56, 1);
    });
  });
});
