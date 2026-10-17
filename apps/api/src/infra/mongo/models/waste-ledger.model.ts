/**
 * infra/mongo/models/waste-ledger.model.ts — Mongoose WasteLedger model.
 * DOC2 §2.7.2: WasteLedger {mealId (unique), cookedPortions, leftoverPortions, advisorUsed:boolean, recordedBy}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IWasteLedgerDocument extends Document {
  mealId: string;
  cookedPortions: number;
  leftoverPortions: number;
  advisorUsed: boolean;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const wasteLedgerSchema = new Schema<IWasteLedgerDocument>(
  {
    mealId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    cookedPortions: {
      type: Number,
      required: true,
      min: 1,
    },
    leftoverPortions: {
      type: Number,
      required: true,
      min: 0,
    },
    advisorUsed: {
      type: Boolean,
      required: true,
      default: false,
    },
    recordedBy: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const WasteLedgerModel = model<IWasteLedgerDocument>('WasteLedger', wasteLedgerSchema);
