/**
 * infra/mongo/models/tray-hold.model.ts — Mongoose TrayHold model.
 * DOC2 §2.7.2: TrayHold {mealId, counterId?, dish?, reportId, status:'held'|'released', releasedBy?, releasedAt?}
 */

import { Schema, model, type Document } from 'mongoose';

export interface ITrayHoldDocument extends Document {
  mealId: string;
  counterId?: string;
  dish?: string;
  reportId: string;
  status: 'held' | 'released';
  releasedBy?: string;
  releasedAt?: number;
  createdAt: Date;
  updatedAt: Date;
}

const trayHoldSchema = new Schema<ITrayHoldDocument>(
  {
    mealId: {
      type: String,
      required: true,
      trim: true,
    },
    counterId: {
      type: String,
      required: false,
    },
    dish: {
      type: String,
      required: false,
    },
    reportId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['held', 'released'],
      required: true,
      default: 'held',
    },
    releasedBy: {
      type: String,
      required: false,
    },
    releasedAt: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

trayHoldSchema.index({ reportId: 1 });
trayHoldSchema.index({ mealId: 1, status: 1 });

export const TrayHoldModel = model<ITrayHoldDocument>('TrayHold', trayHoldSchema);
