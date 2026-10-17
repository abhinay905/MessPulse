/**
 * lib/geolocation.ts — browser Geolocation API wrapper with strict timeout.
 * DOC3 §3.4.
 *
 * Rules:
 * - 5-second timeout
 * - Returns undefined on denial, timeout, or absence of API (never throws into UI)
 * - Returns raw lat/lng/accuracyM only for immediate in-memory check-in payload
 */

export interface GeoLocationResult {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export async function getCurrentLocation(timeoutMs = 5000): Promise<GeoLocationResult | undefined> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
    return undefined;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(undefined);
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          });
        }
      },
      () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(undefined);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 30000,
      }
    );
  });
}
