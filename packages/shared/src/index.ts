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
