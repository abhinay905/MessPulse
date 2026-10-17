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
  // Phase 2 Settings Additions (DOC2 §2.7.3)
  enrolledCount?: number | undefined;
  defaultEatRate?: number | undefined;
  portionsPerPerson?: number | undefined;
  safetyMarginPct?: number | undefined;
  counters?: Array<{ id: string; label: string; servicePerMin: number }> | undefined;
  optOutCutoffMin?: number | undefined;
  ratingDelayMin?: number | undefined;
  walkToMessMin?: number | undefined;
  batchQuality?: { threshold: number; windowMin: number; cooldownMin: number } | undefined;
  unaccounted?: {
    windowMin: number;
    minAbsolute: number;
    tolerancePct: number;
    minCameraEntries: number;
    cooldownMin: number;
  } | undefined;
  randomAudit?: { enabled: boolean; everyN: number } | undefined;
  deviceAnomaly?: { maxUsersPerDevice: number; maxDevicesPerUser: number; windowMin: number } | undefined;
  rebate?: {
    pointsPerOptOut: number;
    fastPassCost: number;
    maxFastPassesPerMeal: number;
    blockAfterViolations: number;
  } | undefined;
  autoCalibrateDemand?: boolean | undefined;
  dpsWeights?: { rating: number; skip: number } | undefined;
  imageRetentionDays?: number | undefined;
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
  autoCalibrated?: boolean | undefined; // Phase 2: DOC2 §2.7.2
  counters?: string[] | undefined;      // Phase 2: DOC2 §2.7.2
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
  subjectKey?: string | undefined; // Phase 2: DOC2 §2.7.2 (dedupe key)
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

// ─── Phase 2 Entities (DOC2 §2.7.2) ──────────────────────────────────────────

export interface OptOutEntity {
  id?: string | undefined;
  userId: string;
  mealId: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface RatingEntity {
  id?: string | undefined;
  sessionId: string;
  userId: string;
  mealId: string;
  stars: number;
  dishVotes?: Array<{ dish: string; vote: 'up' | 'down' }> | undefined;
  comment?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface ComplaintEntity {
  id?: string | undefined;
  sessionId: string;
  userId: string;
  mealId: string;
  tier: 1;
  category: 'cold_food' | 'undercooked' | 'oversalted' | 'stale' | 'quantity' | 'other';
  note?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface HygieneReportEntity {
  id?: string | undefined;
  sessionId: string;
  userId: string;
  mealId: string;
  kind: 'foreign_object' | 'insect' | 'other';
  imageKey: string;
  note?: string | undefined;
  counterId?: string | undefined;
  dish?: string | undefined;
  status: 'open' | 'resolved';
  resolvedBy?: string | undefined;
  resolutionNote?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface TrayHoldEntity {
  id?: string | undefined;
  mealId: string;
  counterId?: string | undefined;
  dish?: string | undefined;
  reportId: string;
  status: 'held' | 'released';
  releasedBy?: string | undefined;
  releasedAt?: number | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface WasteLedgerEntity {
  id?: string | undefined;
  mealId: string;
  cookedPortions: number;
  leftoverPortions: number;
  advisorUsed: boolean;
  recordedBy: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface MealSummaryEntity {
  id?: string | undefined;
  messId: string;
  mealId: string;
  type: string;
  dayOfWeek: number;
  totalEntries: number;
  peakOccupancy: number;
  optOutCount: number;
  enrolledCount: number;
  appCheckIns: number;
  adoptionRatio: number;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface TimetableBreakEntity {
  id?: string | undefined;
  messId: string;
  dayOfWeek: number;
  startsAt: string; // 'HH:mm'
  endsAt: string;   // 'HH:mm'
  label: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface DishStatEntity {
  id?: string | undefined;
  messId: string;
  dish: string;
  mealType: string;
  timesServed: number;
  ratingSum: number;
  ratingCount: number;
  upVotes: number;
  downVotes: number;
  skipDeviationSum: number;
  dps: number | null;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface RebateLedgerEntity {
  id?: string | undefined;
  userId: string;
  mealId: string;
  points: number;
  reason: 'opt_out_honoured' | 'redeem_pass' | 'adjustment';
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface FastPassEntity {
  id?: string | undefined;
  userId: string;
  mealId: string;
  code: string;
  status: 'issued' | 'used' | 'expired';
  usedAt?: number | undefined;
  usedBy?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface PushSubscriptionEntity {
  id?: string | undefined;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface DeviceSightingEntity {
  id?: string | undefined;
  deviceId: string;
  userId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface AuditEventEntity {
  id?: string | undefined;
  mealId: string;
  kind: 'random_audit' | 'unaccounted_entries' | 'device_anomaly';
  raisedAt: number;
  ackedAt?: number | undefined;
  outcome?: 'checked' | 'skipped' | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

// ─── Phase 2 Repositories (DOC3 §3.12) ────────────────────────────────────────

export interface OptOutRepository {
  upsert(userId: string, mealId: string, createdAt?: Date): Promise<OptOutEntity>;
  remove(userId: string, mealId: string): Promise<boolean>;
  findByUserMeal(userId: string, mealId: string): Promise<OptOutEntity | null>;
  countByMeal(mealId: string): Promise<number>;
}

export interface RatingRepository {
  save(rating: Omit<RatingEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<RatingEntity>;
  findBySessionId(sessionId: string): Promise<RatingEntity | null>;
  listForMeal(mealId: string): Promise<RatingEntity[]>;
  listByUser(userId: string): Promise<RatingEntity[]>;
}

export interface ComplaintRepository {
  save(complaint: Omit<ComplaintEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComplaintEntity>;
  findDuplicate(sessionId: string, category: string): Promise<ComplaintEntity | null>;
  listForMeal(mealId: string, options?: { limit?: number }): Promise<ComplaintEntity[]>;
  countByMealCategory(mealId: string, category: string, sinceMs: number): Promise<number>;
}

export interface HygieneReportRepository {
  save(report: Omit<HygieneReportEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<HygieneReportEntity>;
  findById(id: string): Promise<HygieneReportEntity | null>;
  list(options?: { status?: 'open' | 'resolved'; limit?: number }): Promise<HygieneReportEntity[]>;
  resolve(id: string, resolvedBy: string, resolutionNote: string): Promise<HygieneReportEntity | null>;
  countTodayByUser(userId: string, now: number): Promise<number>;
}

export interface TrayHoldRepository {
  save(hold: Omit<TrayHoldEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<TrayHoldEntity>;
  findById(id: string): Promise<TrayHoldEntity | null>;
  findActiveByReportId(reportId: string): Promise<TrayHoldEntity | null>;
  list(options?: { status?: 'held' | 'released'; mealId?: string; limit?: number }): Promise<TrayHoldEntity[]>;
  release(id: string, releasedBy: string, releasedAt: number): Promise<TrayHoldEntity | null>;
}

export interface WasteLedgerRepository {
  save(entry: Omit<WasteLedgerEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<WasteLedgerEntity>;
  findByMealId(mealId: string): Promise<WasteLedgerEntity | null>;
  listRecent(limit?: number): Promise<WasteLedgerEntity[]>;
}

export interface MealSummaryRepository {
  save(summary: Omit<MealSummaryEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealSummaryEntity>;
  findByMealId(mealId: string): Promise<MealSummaryEntity | null>;
  listHistory(messId: string, mealType: string, dayOfWeek: number, limit?: number): Promise<MealSummaryEntity[]>;
}

export interface TimetableBreakRepository {
  replaceForMess(messId: string, breaks: Array<Omit<TimetableBreakEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TimetableBreakEntity[]>;
  listForMess(messId: string): Promise<TimetableBreakEntity[]>;
}

export interface DishStatRepository {
  upsert(stat: Omit<DishStatEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<DishStatEntity>;
  findByDish(messId: string, dish: string, mealType: string): Promise<DishStatEntity | null>;
  listLeaderboard(messId: string, limit?: number): Promise<DishStatEntity[]>;
  incrementRating(messId: string, dish: string, mealType: string, stars: number, upVote?: boolean, downVote?: boolean): Promise<DishStatEntity>;
  updateDps(messId: string, dish: string, mealType: string, dps: number | null, skipDeviation?: number): Promise<DishStatEntity | null>;
}

export interface RebateLedgerRepository {
  save(entry: Omit<RebateLedgerEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<RebateLedgerEntity>;
  getBalance(userId: string): Promise<number>;
  getHistory(userId: string): Promise<RebateLedgerEntity[]>;
  countViolations(userId: string): Promise<number>;
}

export interface FastPassRepository {
  save(pass: Omit<FastPassEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<FastPassEntity>;
  findByCode(code: string): Promise<FastPassEntity | null>;
  findByUserMeal(userId: string, mealId: string): Promise<FastPassEntity | null>;
  markUsed(code: string, usedBy: string, usedAt: number): Promise<FastPassEntity | null>;
  countForMeal(mealId: string): Promise<number>;
}

export interface PushSubscriptionRepository {
  save(subscription: Omit<PushSubscriptionEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PushSubscriptionEntity>;
  findByEndpoint(endpoint: string): Promise<PushSubscriptionEntity | null>;
  listByUser(userId: string): Promise<PushSubscriptionEntity[]>;
  deleteByEndpoint(endpoint: string): Promise<boolean>;
  deleteByUser(userId: string): Promise<number>;
}

export interface DeviceSightingRepository {
  record(deviceId: string, userId: string, now: number): Promise<DeviceSightingEntity>;
  listForDevice(deviceId: string, sinceMs: number): Promise<DeviceSightingEntity[]>;
  listForUser(userId: string, sinceMs: number): Promise<DeviceSightingEntity[]>;
}

export interface AuditEventRepository {
  save(event: Omit<AuditEventEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AuditEventEntity>;
  findById(id: string): Promise<AuditEventEntity | null>;
  listForMeal(mealId: string): Promise<AuditEventEntity[]>;
  ack(id: string, ackedAt: number, outcome: 'checked' | 'skipped'): Promise<AuditEventEntity | null>;
}

// ─── Phase 2 Store / Service Ports (DOC3 §3.12) ───────────────────────────────

export interface RatingDueStore {
  schedule(sessionId: string, userId: string, dueAt: number): Promise<void>;
  popDue(now: number): Promise<Array<{ sessionId: string; userId: string }>>;
}

export interface AuditCounterStore {
  increment(mealId: string, n?: number): Promise<number>;
  reset(mealId: string): Promise<void>;
  get(mealId: string): Promise<number>;
}

export interface ZoneReadingStore {
  save(mealId: string, zoneId: string, count: number, timestamp: number): Promise<void>;
  getLatest(mealId: string, zoneId: string): Promise<{ count: number; timestamp: number } | null>;
}

export interface ManualQueueStore {
  set(mealId: string, counterId: string, length: number, ttlSec?: number): Promise<void>;
  get(mealId: string, counterId: string): Promise<number | null>;
}

export interface ObjectStorage {
  put(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  getSignedUrl(key: string, expirySec?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface PushNotifier {
  send(userId: string, payload: { title: string; body: string; url?: string }): Promise<void>;
}

