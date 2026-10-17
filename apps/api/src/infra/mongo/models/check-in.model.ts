/**
 * infra/mongo/models/check-in.model.ts — Mongoose CheckIn model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface ICheckInDocument extends Document {
  sessionId: string;
  userId: string;
  mealId: string;
  checkedInAt: number;
  queueWaitSecAtEntry: number;
  expectedStaySec: number;
  hardExpirySec: number;
  method: 'qr' | 'geofence' | 'sim';
  geofence: 'inside' | 'outside' | 'unknown';
  endedAt?: number | undefined;
  endReason: 'expired' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

const checkInSchema = new Schema<ICheckInDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    mealId: {
      type: String,
      required: true,
      trim: true,
    },
    checkedInAt: {
      type: Number,
      required: true,
    },
    queueWaitSecAtEntry: {
      type: Number,
      required: true,
    },
    expectedStaySec: {
      type: Number,
      required: true,
    },
    hardExpirySec: {
      type: Number,
      required: true,
    },
    method: {
      type: String,
      enum: ['qr', 'geofence', 'sim'],
      required: true,
    },
    geofence: {
      type: String,
      enum: ['inside', 'outside', 'unknown'],
      required: true,
    },
    endedAt: {
      type: Number,
      required: false,
    },
    endReason: {
      type: String,
      enum: ['expired', 'manual'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

checkInSchema.index({ mealId: 1, checkedInAt: 1 });
checkInSchema.index({ userId: 1, mealId: 1 });
// TTL index: retention 90 days (DOC2 §2.3)
checkInSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const CheckInModel = model<ICheckInDocument>('CheckIn', checkInSchema);
