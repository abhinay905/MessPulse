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
  weight?: number | undefined; // computed lazily on read; not stored
}

// ─── Camera reading shape ─────────────────────────────────────────────────────

export interface CameraReading {
  seq: number;
  count: number;          // net occupancy from camera
  inCount: number;        // cumulative in since script start
  outCount: number;       // cumulative out since script start
  capturedAt: number;     // epoch ms (camera-side, informational)
  receivedAt: number;     // epoch ms (server authoritative)
  cameraBaseline?: number | undefined;
}

// ─── Ephemeral Stores (Redis / Memory) ────────────────────────────────────────

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

// ─── Durable Mongo Entity Shapes (DOC2 §2.3) ──────────────────────────────────

export interface UserEntity {
  id?: string | undefined;
  email: string;
  rollNo?: string | undefined;
  name: string;
  role: 'student' | 'staff' | 'admin';
  pinHash?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface MessSettingsEntity {
  id?: string | undefined;
  messId: string;
  name: string;
  seatCapacity: number;
  servicePerMin: number;
  geofence: {
    lat: number;
    lng: number;
    radiusM: number;
  };
  baseMealMin: number;
  maxSessionMin: number;
  decay: {
    tail: Array<{ untilOffsetMin: number; weight: number }>;
  };
  staleCameraSec: number;
  alertThresholds: Record<string, unknown>;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface MealEntity {
  id?: string | undefined;
  messId: string;
  mealId: string;
  type: string;
  startsAt: number; // epoch ms
  endsAt: number;   // epoch ms
  menuItems: string[];
  menuDemandFactorMin: number;
  trayCapacity?: number | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface CheckInEntity {
  id?: string | undefined;
  sessionId: string;
  userId: string;
  mealId: string;
  checkedInAt: number; // epoch ms
  queueWaitSecAtEntry: number;
  expectedStaySec: number;
  hardExpirySec: number;
  method: 'qr' | 'geofence' | 'sim';
  geofence: 'inside' | 'outside' | 'unknown';
  endedAt?: number | undefined;
  endReason: 'expired' | 'manual';
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface OccupancySnapshotEntity {
  id?: string | undefined;
  messId: string;
  mealId: string | null;
  ts: number; // epoch ms
  cameraCount: number;
  sessionEstimate: number;
  decayWeighted: number;
  estWaitMin: number;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface AlertEntity {
  id?: string | undefined;
  messId: string;
  mealId: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  payload: Record<string, unknown>;
  raisedAt: number; // epoch ms
  ackedBy?: string | undefined;
  ackedAt?: number | undefined;
  clearedAt?: number | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

// ─── Durable Mongo Repositories (DOC3 §3.1) ───────────────────────────────────

export interface UserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  upsertStudent(email: string, name?: string): Promise<UserEntity>;
  createStaffOrAdmin(user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEntity>;
}

export interface SettingsRepository {
  getByMessId(messId: string): Promise<MessSettingsEntity | null>;
  upsert(settings: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity>;
}

export interface MealRepository {
  findByMealId(messId: string, mealId: string): Promise<MealEntity | null>;
  findActiveAt(messId: string, now: number): Promise<MealEntity | null>;
  findActiveOrUpcoming(messId: string, now: number, bufferMs?: number): Promise<MealEntity | null>;
  upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity>;
  updateTrayCapacity(messId: string, mealId: string, trayCapacity: number): Promise<MealEntity | null>;
}

export interface CheckInRepository {
  archive(checkIn: Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>;
  archiveMany(checkIns: Array<Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  findBySessionId(sessionId: string): Promise<CheckInEntity | null>;
  listForMeal(mealId: string): Promise<CheckInEntity[]>;
}

export interface SnapshotRepository {
  save(snapshot: Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>;
  queryHistory(messId: string, fromTs: number, toTs: number): Promise<OccupancySnapshotEntity[]>;
  getLatest(messId: string): Promise<OccupancySnapshotEntity | null>;
}

export interface AlertRepository {
  create(alert: Omit<AlertEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertEntity>;
  findOpen(messId: string, mealId: string, ruleId: string): Promise<AlertEntity | null>;
  list(messId: string, options?: { openOnly?: boolean; limit?: number }): Promise<AlertEntity[]>;
  ack(alertId: string, ackedBy: string, ackedAt: number): Promise<AlertEntity | null>;
  clear(alertId: string, clearedAt: number): Promise<AlertEntity | null>;
}
