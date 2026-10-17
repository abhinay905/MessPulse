/**
 * infra/mongo/models/device-sighting.model.ts — Mongoose DeviceSighting model.
 * DOC2 §2.7.2: DeviceSighting {deviceId, userId, firstSeenAt, lastSeenAt} unique(deviceId, userId); TTL 30 d
 */

import { Schema, model, type Document } from 'mongoose';

export interface IDeviceSightingDocument extends Document {
  deviceId: string;
  userId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSightingSchema = new Schema<IDeviceSightingDocument>(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    firstSeenAt: {
      type: Number,
      required: true,
    },
    lastSeenAt: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

deviceSightingSchema.index({ deviceId: 1, userId: 1 }, { unique: true });
// TTL index: 30 days retention (DOC2 §2.7.2)
deviceSightingSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const DeviceSightingModel = model<IDeviceSightingDocument>(
  'DeviceSighting',
  deviceSightingSchema
);
