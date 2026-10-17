/**
 * @messpulse/shared — single source of contract for the entire monorepo.
 *
 * All zod schemas are defined here; TypeScript types are inferred with z.infer<>.
 * No runtime dependencies other than zod.
 */

import { z } from 'zod';

// ─── Roles ────────────────────────────────────────────────────────────────────

export const RoleSchema = z.enum(['student', 'staff', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

// ─── Auth Contracts (DOC2 §2.4, DOC3 §3.8) ────────────────────────────────────

export const OtpRequestSchema = z.object({
  email: z.string().email('Valid email is required'),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  email: z.string().email('Valid email is required'),
  code: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit numeric code'),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export const StaffLoginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  pin: z.string().min(1, 'PIN is required'),
});
export type StaffLogin = z.infer<typeof StaffLoginSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  name: z.string(),
  email: z.string().email(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: AuthUserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ─── Live Count Payload (POST /mess/live-count from vision script) ─────────────

export const LiveCountPayloadSchema = z.object({
  messId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),         // running net count from the script
  inCount: z.number().int().nonnegative(),       // cumulative since script start
  outCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative().optional(), // people visible now (cross-check)
  capturedAt: z.number().int(),                  // epoch ms, camera-side (informational)
  zone: z.string().optional(),                   // Phase 2: entrance | regular-queue | special-queue
});
export type LiveCountPayload = z.infer<typeof LiveCountPayloadSchema>;

// ─── Occupancy ────────────────────────────────────────────────────────────────

export const OccupancyLevelSchema = z.enum(['low', 'medium', 'high']);
export type OccupancyLevel = z.infer<typeof OccupancyLevelSchema>;

// ─── Status Snapshot (GET /status and status:update socket event) ─────────────

export const BestWindowSchema = z.object({
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  expectedLevel: OccupancyLevelSchema,
  estWaitMin: z.number().nonnegative(),
});
export type BestWindow = z.infer<typeof BestWindowSchema>;

export const QueueItemSchema = z.object({
  counterId: z.string(),
  label: z.string(),
  estWaitMin: z.number().nonnegative(),
  length: z.number().int().nonnegative(),
  source: z.enum(['camera', 'manual', 'calibrated']),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const LectureWaveSchema = z.object({
  active: z.boolean(),
  breakLabel: z.string().optional(),
  peakInMin: z.number().optional(),
});
export type LectureWave = z.infer<typeof LectureWaveSchema>;

export const NudgeSchema = z.object({
  window: z.object({
    startsAt: z.number().int(),
    endsAt: z.number().int(),
  }),
  reason: z.string(),
});
export type Nudge = z.infer<typeof NudgeSchema>;

export const StatusSnapshotSchema = z.object({
  messId: z.string(),
  mealId: z.string().nullable(),
  ts: z.number().int(),
  state: z.enum(['closed', 'open']),
  occupancy: z.object({
    value: z.number().int().nonnegative(),
    capacity: z.number().int().positive(),
    level: OccupancyLevelSchema,
    source: z.enum(['camera', 'sessions']),
    stale: z.boolean(),
  }),
  activeSessions: z.number().int().nonnegative(),
  decayWeightedSessions: z.number().nonnegative(),
  waitMin: z.number().nonnegative(),
  waitRangeMin: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  bestWindows: z.array(BestWindowSchema),
  camera: z.object({
    lastSeenAt: z.number().int().nullable(),
    stale: z.boolean(),
  }),
  // Phase 2 optional snapshot fields (DOC2 §2.7.5, DOC3 §3.12)
  queues: z.array(QueueItemSchema).optional(),
  lectureWave: LectureWaveSchema.optional(),
  nudge: NudgeSchema.optional(),
});
export type StatusSnapshot = z.infer<typeof StatusSnapshotSchema>;

// ─── Session DTO ──────────────────────────────────────────────────────────────

export const GeofenceResultSchema = z.enum(['inside', 'outside', 'unknown']);
export type GeofenceResult = z.infer<typeof GeofenceResultSchema>;

export const SessionDTOSchema = z.object({
  sessionId: z.string().uuid(),
  mealId: z.string(),
  checkedInAt: z.number().int(),
  expectedStayEndsAt: z.number().int(),
  hardExpiresAt: z.number().int(),
  geofence: GeofenceResultSchema,
});
export type SessionDTO = z.infer<typeof SessionDTOSchema>;

export const CheckInRequestSchema = z.object({
  mealToken: z.string().min(1, 'mealToken is required'),
  geo: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().optional(),
      accuracyM: z.number().optional(),
    })
    .optional(),
});
export type CheckInRequest = z.infer<typeof CheckInRequestSchema>;

// ─── Alert DTO ────────────────────────────────────────────────────────────────

export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertDTOSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  mealId: z.string(),
  severity: AlertSeveritySchema,
  message: z.string(),
  raisedAt: z.number().int(),
  ackedAt: z.number().int().optional(),
  clearedAt: z.number().int().optional(),
});
export type AlertDTO = z.infer<typeof AlertDTOSchema>;

// ─── Settings DTO ─────────────────────────────────────────────────────────────

export const CounterSettingSchema = z.object({
  id: z.string(),
  label: z.string(),
  servicePerMin: z.number().positive(),
});
export type CounterSetting = z.infer<typeof CounterSettingSchema>;

export const SettingsDTOSchema = z.object({
  messId: z.string(),
  capacity: z.number().int().positive(),
  servicePerMin: z.number().positive(),
  demandFactor: z.number().int().min(0).max(5),    // admin-set minutes (0–5)
  baseMealMin: z.number().int().positive(),          // default 18
  maxSessionMin: z.number().int().positive(),        // default 60
  staleCameraSec: z.number().int().positive(),       // default 30
  alertCooldownSec: z.number().int().positive(),     // default 180 (3 min)
  updatedAt: z.number().int(),

  // Phase 2 Settings Additions (DOC2 §2.7.3)
  enrolledCount: z.number().int().positive().default(800),
  defaultEatRate: z.number().min(0).max(1).default(0.7),
  portionsPerPerson: z.number().positive().default(1),
  safetyMarginPct: z.number().min(3).max(15).default(8),
  counters: z.array(CounterSettingSchema).default([
    { id: 'regular', label: 'Regular Counter', servicePerMin: 12 },
    { id: 'special', label: 'Special / Quick Counter', servicePerMin: 18 },
  ]),
  optOutCutoffMin: z.number().int().positive().default(60),
  ratingDelayMin: z.number().int().positive().default(22),
  walkToMessMin: z.number().int().positive().default(5),
  batchQuality: z.object({
    threshold: z.number().int().positive().default(5),
    windowMin: z.number().int().positive().default(10),
    cooldownMin: z.number().int().positive().default(10),
  }).default({ threshold: 5, windowMin: 10, cooldownMin: 10 }),
  unaccounted: z.object({
    windowMin: z.number().int().positive().default(10),
    minAbsolute: z.number().int().positive().default(8),
    tolerancePct: z.number().positive().default(25),
    minCameraEntries: z.number().int().positive().default(15),
    cooldownMin: z.number().int().positive().default(10),
  }).default({ windowMin: 10, minAbsolute: 8, tolerancePct: 25, minCameraEntries: 15, cooldownMin: 10 }),
  randomAudit: z.object({
    enabled: z.boolean().default(false),
    everyN: z.number().int().positive().default(25),
  }).default({ enabled: false, everyN: 25 }),
  deviceAnomaly: z.object({
    maxUsersPerDevice: z.number().int().positive().default(2),
    maxDevicesPerUser: z.number().int().positive().default(3),
    windowMin: z.number().int().positive().default(30),
  }).default({ maxUsersPerDevice: 2, maxDevicesPerUser: 3, windowMin: 30 }),
  rebate: z.object({
    pointsPerOptOut: z.number().int().positive().default(5),
    fastPassCost: z.number().int().positive().default(20),
    maxFastPassesPerMeal: z.number().int().positive().default(10),
    blockAfterViolations: z.number().int().positive().default(2),
  }).default({ pointsPerOptOut: 5, fastPassCost: 20, maxFastPassesPerMeal: 10, blockAfterViolations: 2 }),
  autoCalibrateDemand: z.boolean().default(false),
  dpsWeights: z.object({
    rating: z.number().min(0).max(1).default(0.7),
    skip: z.number().min(0).max(1).default(0.3),
  }).default({ rating: 0.7, skip: 0.3 }),
  imageRetentionDays: z.number().int().positive().default(30),
});
export type SettingsDTO = z.infer<typeof SettingsDTOSchema>;

export const SettingsPatchSchema = SettingsDTOSchema
  .omit({ messId: true, updatedAt: true })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

// ─── Admin Analytics Contracts (DOC3 §3.7) ───────────────────────────────────

export const TimeSeriesPointSchema = z.object({
  ts: z.number().int(),
  camera: z.number().nonnegative(),
  sessionEstimate: z.number().nonnegative(),
  decayWeighted: z.number().nonnegative(),
  waitMin: z.number().nonnegative(),
});
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;

export const DecayCurvePointSchema = z.object({
  offsetMin: z.number(),
  weight: z.number().min(0).max(1),
});
export type DecayCurvePoint = z.infer<typeof DecayCurvePointSchema>;

export const LiveHistogramBinSchema = z.object({
  bin: z.string(),
  count: z.number().int().nonnegative(),
});
export type LiveHistogramBin = z.infer<typeof LiveHistogramBinSchema>;

export const DecayCurveResponseSchema = z.object({
  theoretical: z.array(DecayCurvePointSchema),
  liveHistogram: z.array(LiveHistogramBinSchema),
  activeSessions: z.number().int().nonnegative(),
});
export type DecayCurveResponse = z.infer<typeof DecayCurveResponseSchema>;

export const CheckinTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  expiresAt: z.number().int(),
});
export type CheckinTokenResponse = z.infer<typeof CheckinTokenResponseSchema>;

export const CameraHealthSchema = z.object({
  lastSeenAt: z.number().int().nullable(),
  stale: z.boolean(),
  learnedRatio: z.number().optional(),
});
export type CameraHealth = z.infer<typeof CameraHealthSchema>;

// ─── Socket Event Names ───────────────────────────────────────────────────────

export const SocketEvents = {
  StatusUpdate: 'status:update',
  AlertRaised: 'alert:raised',
  AlertCleared: 'alert:cleared',
  CameraHealth: 'camera:health',
  // Phase 2 additions (DOC2 §2.7.5, DOC3 §3.12)
  RatingDue: 'rating:due',
  HoldRaised: 'hold:raised',
  HoldReleased: 'hold:released',
  FastPassUsed: 'fastpass:used',
  AuditFlagged: 'audit:flagged',
} as const;
export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

// ─── Simulator Contracts (DOC3 §3.9) ──────────────────────────────────────────

export const SimulatorStartSchema = z.object({
  speed: z.number().min(1).max(30).default(6),
  peakPeople: z.number().int().positive().default(220),
  durationMin: z.number().int().positive().default(18),
  appAdoption: z.number().min(0).max(1).default(0.7),
  seed: z.number().int().default(42),
  messId: z.string().optional(),
  mealId: z.string().optional(),
});
export type SimulatorStartInput = z.infer<typeof SimulatorStartSchema>;

export const SimulatorStatusSchema = z.object({
  running: z.boolean(),
  runId: z.string().nullable(),
  speed: z.number().nullable(),
  simulatedElapsedMin: z.number().nullable(),
  eventsRemaining: z.number().nullable(),
  error: z.string().nullable(),
});
export type SimulatorStatus = z.infer<typeof SimulatorStatusSchema>;

// ─── Phase 2 Contracts (DOC2 §2.7.5, DOC3 §3.12) ─────────────────────────────

// 1. Opt-Out (DOC2 §2.7.5, DOC3 §3.13)
export const OptOutRequestSchema = z.object({
  mealId: z.string().min(1),
});
export type OptOutRequest = z.infer<typeof OptOutRequestSchema>;

export const OptOutResponseSchema = z.object({
  optedOut: z.boolean(),
  cutoffAt: z.number().int(),
});
export type OptOutResponse = z.infer<typeof OptOutResponseSchema>;

// 2. Ratings (DOC2 §2.7.5, DOC3 §3.14)
export const DishVoteSchema = z.object({
  dish: z.string().min(1),
  vote: z.enum(['up', 'down']),
});
export type DishVote = z.infer<typeof DishVoteSchema>;

export const RatingSubmitSchema = z.object({
  sessionId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  dishVotes: z.array(DishVoteSchema).optional(),
  comment: z.string().max(280).optional(),
});
export type RatingSubmit = z.infer<typeof RatingSubmitSchema>;

export const PendingRatingSchema = z.object({
  sessionId: z.string(),
  mealId: z.string(),
  dishes: z.array(z.string()),
});
export type PendingRating = z.infer<typeof PendingRatingSchema>;

// 3. Complaints (DOC2 §2.7.5, DOC3 §3.16)
export const ComplaintCategorySchema = z.enum([
  'cold_food',
  'undercooked',
  'oversalted',
  'stale',
  'quantity',
  'other',
]);
export type ComplaintCategory = z.infer<typeof ComplaintCategorySchema>;

export const ComplaintSubmitSchema = z.object({
  sessionId: z.string().uuid(),
  mealId: z.string().min(1),
  tier: z.literal(1).default(1),
  category: ComplaintCategorySchema,
  note: z.string().max(280).optional(),
});
export type ComplaintSubmit = z.infer<typeof ComplaintSubmitSchema>;

// 4. Hygiene Reports & Holds (DOC2 §2.7.5, DOC3 §3.21)
export const HygieneReportKindSchema = z.enum(['foreign_object', 'insect', 'other']);
export type HygieneReportKind = z.infer<typeof HygieneReportKindSchema>;

export const HygieneReportStatusSchema = z.enum(['open', 'resolved']);
export type HygieneReportStatus = z.infer<typeof HygieneReportStatusSchema>;

export const HygieneReportSubmitSchema = z.object({
  sessionId: z.string().uuid(),
  mealId: z.string().min(1),
  kind: HygieneReportKindSchema,
  note: z.string().max(280).optional(),
  counterId: z.string().optional(),
  dish: z.string().optional(),
});
export type HygieneReportSubmit = z.infer<typeof HygieneReportSubmitSchema>;

export const HygieneReportResolveSchema = z.object({
  resolutionNote: z.string().min(1),
});
export type HygieneReportResolve = z.infer<typeof HygieneReportResolveSchema>;

export const TrayHoldStatusSchema = z.enum(['held', 'released']);
export type TrayHoldStatus = z.infer<typeof TrayHoldStatusSchema>;

export const TrayHoldSchema = z.object({
  id: z.string(),
  mealId: z.string(),
  counterId: z.string().optional(),
  dish: z.string().optional(),
  reportId: z.string(),
  status: TrayHoldStatusSchema,
  releasedBy: z.string().optional(),
  releasedAt: z.number().int().optional(),
});
export type TrayHold = z.infer<typeof TrayHoldSchema>;

// 5. Timetable & Breaks (DOC2 §2.7.5, DOC3 §3.18)
export const TimetableBreakSchema = z.object({
  id: z.string().optional(),
  messId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().min(1),
});
export type TimetableBreak = z.infer<typeof TimetableBreakSchema>;

export const TimetableInputSchema = z.object({
  breaks: z.array(TimetableBreakSchema),
});
export type TimetableInput = z.infer<typeof TimetableInputSchema>;

// 6. Forecast (DOC2 §2.7.5, DOC3 §3.18)
export const ForecastPointSchema = z.object({
  minuteOffset: z.number(),
  occupancy: z.number(),
  waitMin: z.number(),
});
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

export const ForecastResponseSchema = z.object({
  messId: z.string(),
  forecast: z.array(ForecastPointSchema),
  basis: z.enum(['history', 'default']),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

// 7. Queue Manual Fallback (DOC2 §2.7.5, DOC3 §3.19)
export const QueueManualInputSchema = z.object({
  length: z.number().int().nonnegative(),
});
export type QueueManualInput = z.infer<typeof QueueManualInputSchema>;

// 8. Waste Ledger & Prep Advice (DOC2 §2.7.5, DOC3 §3.15)
export const WasteRecordInputSchema = z.object({
  mealId: z.string().min(1),
  cookedPortions: z.number().int().positive(),
  leftoverPortions: z.number().int().nonnegative(),
  advisorUsed: z.boolean(),
});
export type WasteRecordInput = z.infer<typeof WasteRecordInputSchema>;

export const PrepAdviceResponseSchema = z.object({
  mealId: z.string(),
  cookPortions: z.number().int().positive(),
  low: z.number().int(),
  high: z.number().int(),
  basis: z.enum(['history', 'default']),
  rationale: z.string(),
});
export type PrepAdviceResponse = z.infer<typeof PrepAdviceResponseSchema>;

export const WasteSummarySchema = z.object({
  mealId: z.string(),
  cookedPortions: z.number().int(),
  leftoverPortions: z.number().int(),
  advisorUsed: z.boolean(),
  recordedBy: z.string(),
  recordedAt: z.number().int(),
});
export type WasteSummary = z.infer<typeof WasteSummarySchema>;

// 9. Dishes & DPS Leaderboard (DOC2 §2.7.5, DOC3 §3.22)
export const DishLeaderboardItemSchema = z.object({
  dish: z.string(),
  mealType: z.string(),
  timesServed: z.number().int(),
  ratingSum: z.number(),
  ratingCount: z.number().int(),
  upVotes: z.number().int(),
  downVotes: z.number().int(),
  skipDeviationSum: z.number(),
  dps: z.number().nullable(),
  updatedAt: z.number().int(),
});
export type DishLeaderboardItem = z.infer<typeof DishLeaderboardItemSchema>;

export const MenuUpdateSchema = z.object({
  menuItems: z.array(z.string().min(1)),
});
export type MenuUpdate = z.infer<typeof MenuUpdateSchema>;

export const ApplyDemandSuggestionSchema = z.object({
  demandFactor: z.number().int().min(0).max(5),
});
export type ApplyDemandSuggestion = z.infer<typeof ApplyDemandSuggestionSchema>;

// 10. Rebates & Fast-Track Pass (DOC2 §2.7.5, DOC3 §3.23)
export const RebateBalanceResponseSchema = z.object({
  userId: z.string(),
  points: z.number().int(),
  violations: z.number().int(),
  blocked: z.boolean(),
});
export type RebateBalanceResponse = z.infer<typeof RebateBalanceResponseSchema>;

export const FastPassSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  mealId: z.string(),
  code: z.string().length(4),
  status: z.enum(['issued', 'used', 'expired']),
  usedAt: z.number().int().optional(),
  usedBy: z.string().optional(),
});
export type FastPass = z.infer<typeof FastPassSchema>;

export const FastPassVerifyInputSchema = z.object({
  code: z.string().length(4),
});
export type FastPassVerifyInput = z.infer<typeof FastPassVerifyInputSchema>;

// 11. Web Push (DOC2 §2.7.5, DOC3 §3.20)
export const PushSubscriptionInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;

// 12. Audit & Device Anomaly (DOC2 §2.7.5, DOC3 §3.24)
export const AuditModeInputSchema = z.object({
  enabled: z.boolean(),
  everyN: z.number().int().positive().optional(),
});
export type AuditModeInput = z.infer<typeof AuditModeInputSchema>;

export const AuditAckInputSchema = z.object({
  outcome: z.enum(['checked', 'skipped']),
});
export type AuditAckInput = z.infer<typeof AuditAckInputSchema>;

export const DeviceSightingSchema = z.object({
  deviceId: z.string().min(1),
  userId: z.string().min(1),
  firstSeenAt: z.number().int(),
  lastSeenAt: z.number().int(),
});
export type DeviceSighting = z.infer<typeof DeviceSightingSchema>;

