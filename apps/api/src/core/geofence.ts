/**
 * core/geofence.ts — pure geofence evaluation using Haversine formula.
 * DOC3 §3.4.
 * Pure domain function: no I/O, no framework imports.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface FenceArea {
  lat: number;
  lng: number;
  radiusM: number;
}

export type GeofenceResult = 'inside' | 'outside' | 'unknown';

/**
 * Evaluates whether a diner is inside the mess geofence.
 *
 * Rules (DOC3 §3.4):
 * - undefined or accuracy > 150 m → 'unknown' (indoor GPS accuracy too poor)
 * - haversine distance <= radiusM → 'inside'
 * - else → 'outside'
 */
export function evaluateGeofence(
  geo: GeoPoint | undefined,
  fence: FenceArea
): GeofenceResult {
  if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number' || typeof geo.accuracyM !== 'number') {
    return 'unknown';
  }

  if (geo.accuracyM > 150 || geo.accuracyM < 0) {
    return 'unknown';
  }

  const distanceM = haversineDistanceM(geo.lat, geo.lng, fence.lat, fence.lng);
  return distanceM <= fence.radiusM ? 'inside' : 'outside';
}

/**
 * Calculates great-circle distance in meters between two lat/lng coordinates using the Haversine formula.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Mean Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
