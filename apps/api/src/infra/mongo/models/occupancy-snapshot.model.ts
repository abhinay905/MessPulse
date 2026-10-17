/**
 * infra/mongo/models/occupancy-snapshot.model.ts — Mongoose OccupancySnapshot model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface IOccupancySnapshotDocument extends Document {
  messId: string;
  mealId: string | null;
  ts: number;
  cameraCount: number;
  sessionEstimate: number;
  decayWeighted: number;
  estWaitMin: number;
  createdAt: Date;
  updatedAt: Date;
}

const occupancySnapshotSchema = new Schema<IOccupancySnapshotDocument>(
  {
    messId: {
      type: String,
      required: true,
      trim: true,
    },
    mealId: {
      type: String,
      required: false,
      default: null,
    },
    ts: {
      type: Number,
      required: true,
    },
    cameraCount: {
      type: Number,
      required: true,
    },
    sessionEstimate: {
      type: Number,
      required: true,
    },
    decayWeighted: {
      type: Number,
      required: true,
    },
    estWaitMin: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

occupancySnapshotSchema.index({ messId: 1, ts: 1 });
// TTL index: retention 1 year (DOC2 §2.3)
occupancySnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const OccupancySnapshotModel = model<IOccupancySnapshotDocument>(
  'OccupancySnapshot',
  occupancySnapshotSchema
);
