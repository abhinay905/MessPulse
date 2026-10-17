/**
 * infra/mongo/models/mess-settings.model.ts — Mongoose MessSettings model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface IMessSettingsDocument extends Document {
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
  enrolledCount?: number;
  defaultEatRate?: number;
  portionsPerPerson?: number;
  safetyMarginPct?: number;
  counters?: Array<{ id: string; label: string; servicePerMin: number }>;
  optOutCutoffMin?: number;
  ratingDelayMin?: number;
  walkToMessMin?: number;
  batchQuality?: { threshold: number; windowMin: number; cooldownMin: number };
  unaccounted?: {
    windowMin: number;
    minAbsolute: number;
    tolerancePct: number;
    minCameraEntries: number;
    cooldownMin: number;
  };
  randomAudit?: { enabled: boolean; everyN: number };
  deviceAnomaly?: { maxUsersPerDevice: number; maxDevicesPerUser: number; windowMin: number };
  rebate?: {
    pointsPerOptOut: number;
    fastPassCost: number;
    maxFastPassesPerMeal: number;
    blockAfterViolations: number;
  };
  autoCalibrateDemand?: boolean;
  dpsWeights?: { rating: number; skip: number };
  imageRetentionDays?: number;
  createdAt: Date;
  updatedAt: Date;
}

const messSettingsSchema = new Schema<IMessSettingsDocument>(
  {
    messId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    seatCapacity: {
      type: Number,
      required: true,
    },
    servicePerMin: {
      type: Number,
      required: true,
    },
    geofence: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      radiusM: { type: Number, required: true },
    },
    baseMealMin: {
      type: Number,
      required: true,
      default: 18,
    },
    maxSessionMin: {
      type: Number,
      required: true,
      default: 60,
    },
    decay: {
      tail: [
        {
          untilOffsetMin: { type: Number, required: true },
          weight: { type: Number, required: true },
        },
      ],
    },
    staleCameraSec: {
      type: Number,
      required: true,
      default: 30,
    },
    alertThresholds: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Phase 2 Settings Additions (DOC2 §2.7.3)
    enrolledCount: { type: Number, default: 800 },
    defaultEatRate: { type: Number, default: 0.7 },
    portionsPerPerson: { type: Number, default: 1 },
    safetyMarginPct: { type: Number, default: 8 },
    counters: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        servicePerMin: { type: Number, required: true },
      },
    ],
    optOutCutoffMin: { type: Number, default: 60 },
    ratingDelayMin: { type: Number, default: 22 },
    walkToMessMin: { type: Number, default: 5 },
    batchQuality: {
      type: Schema.Types.Mixed,
      default: { threshold: 5, windowMin: 10, cooldownMin: 10 },
    },
    unaccounted: {
      type: Schema.Types.Mixed,
      default: { windowMin: 10, minAbsolute: 8, tolerancePct: 25, minCameraEntries: 15, cooldownMin: 10 },
    },
    randomAudit: {
      type: Schema.Types.Mixed,
      default: { enabled: false, everyN: 25 },
    },
    deviceAnomaly: {
      type: Schema.Types.Mixed,
      default: { maxUsersPerDevice: 2, maxDevicesPerUser: 3, windowMin: 30 },
    },
    rebate: {
      type: Schema.Types.Mixed,
      default: { pointsPerOptOut: 5, fastPassCost: 20, maxFastPassesPerMeal: 10, blockAfterViolations: 2 },
    },
    autoCalibrateDemand: { type: Boolean, default: false },
    dpsWeights: {
      type: Schema.Types.Mixed,
      default: { rating: 0.7, skip: 0.3 },
    },
    imageRetentionDays: { type: Number, default: 30 },
  },
  {
    timestamps: true,
  }
);

export const MessSettingsModel = model<IMessSettingsDocument>('MessSettings', messSettingsSchema);
