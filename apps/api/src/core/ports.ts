/**
 * core/ports.ts — port interfaces used across modules.
 * Declared once here; implemented in infra/; wired in container.ts.
 * DOC3 §3.1 — these are pure TS interfaces with no runtime dependencies.
 */

// ─── Clock port (also defined in infra/clock.ts; re-exported here for core/) ─

export interface Clock {
  now(): number; // epoch ms
}

// ─── Active session shape (owned by SessionStore) ─────────────────────────────

export interface ActiveSession {
  sessionId: string;         // uuid v4
  userId: string;
  mealId: string;
  messId: string;
  checkedInAt: number;       // epoch ms
  expectedStayEndsAt: number;// epoch ms  (base + queueWait + demandFactor)
  hardExpiresAt: number;     // epoch ms  (expectedStayEndsAt + 17 min, capped by maxSessionMin)
  geofence: 'inside' | 'outside' | 'unknown';
  method: 'qr' | 'geo' | 'sim';
  weight?: number;           // computed lazily on read; not stored
}

// ─── Camera reading shape ─────────────────────────────────────────────────────

export interface CameraReading {
  seq: number;
  count: number;          // net occupancy from camera
  inCount: number;        // cumulative in since script start
  outCount: number;       // cumulative out since script start
  capturedAt: number;     // epoch ms (camera-side, informational)
  receivedAt: number;     // epoch ms (server authoritative)
}

// ─── Ports ────────────────────────────────────────────────────────────────────

export interface SessionStore {
  start(session: ActiveSession): Promise<'created' | 'already_active'>;
  getActiveForUser(userId: string, mealId: string): Promise<ActiveSession | null>;
  end(userId: string, mealId: string): Promise<ActiveSession | null>;
  listActive(mealId: string, now: number): Promise<ActiveSession[]>;
  removeExpired(mealId: string, now: number): Promise<ActiveSession[]>;
}

export interface EntryVelocityStore {
  /** Record N entries at a given timestamp for idempotent replay. */
  record(mealId: string, eventId: string, at: number, n: number): Promise<void>;
  /** Count entries recorded since sinceMs. */
  countSince(mealId: string, sinceMs: number): Promise<number>;
}

export interface CameraReadingStore {
  saveLatest(mealId: string, reading: CameraReading): Promise<void>;
  getLatest(mealId: string): Promise<CameraReading | null>;
}

export interface OtpStore {
  /** Store hashed OTP with TTL in seconds. */
  set(email: string, hashedOtp: string, ttlSec: number): Promise<void>;
  /** Retrieve stored hash; null if expired or not found. */
  get(email: string): Promise<string | null>;
  /** Remove OTP after successful verification. */
  delete(email: string): Promise<void>;
  /** Increment and return attempt count. */
  incrementAttempts(email: string): Promise<number>;
}
