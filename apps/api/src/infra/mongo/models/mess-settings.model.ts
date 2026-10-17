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
  },
  {
    timestamps: true,
  }
);

export const MessSettingsModel = model<IMessSettingsDocument>('MessSettings', messSettingsSchema);
