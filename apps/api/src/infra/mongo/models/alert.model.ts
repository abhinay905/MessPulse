/**
 * infra/mongo/models/alert.model.ts — Mongoose Alert model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface IAlertDocument extends Document {
  messId: string;
  mealId: string;
  ruleId: string;
  subjectKey?: string | undefined; // Phase 2: DOC2 §2.7.2
  severity: 'info' | 'warning' | 'critical';
  payload: Record<string, unknown>;
  raisedAt: number;
  ackedBy?: string | undefined;
  ackedAt?: number | undefined;
  clearedAt?: number | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlertDocument>(
  {
    messId: {
      type: String,
      required: true,
      trim: true,
    },
    mealId: {
      type: String,
      required: true,
      trim: true,
    },
    ruleId: {
      type: String,
      required: true,
      trim: true,
    },
    subjectKey: {
      type: String,
      required: false,
      trim: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    raisedAt: {
      type: Number,
      required: true,
    },
    ackedBy: {
      type: String,
      required: false,
    },
    ackedAt: {
      type: Number,
      required: false,
    },
    clearedAt: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

alertSchema.index({ messId: 1, raisedAt: -1 });
alertSchema.index({ mealId: 1, ruleId: 1 });
// TTL index: retention 1 year (DOC2 §2.3)
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const AlertModel = model<IAlertDocument>('Alert', alertSchema);
