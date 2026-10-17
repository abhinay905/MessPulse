/**
 * infra/mongo/models/rebate-ledger.model.ts — Mongoose RebateLedger model.
 * DOC2 §2.7.2: RebateLedger {userId, mealId, points, reason:'opt_out_honoured'|'redeem_pass'|'adjustment'} unique(userId, mealId, reason)
 */

import { Schema, model, type Document } from 'mongoose';

export interface IRebateLedgerDocument extends Document {
  userId: string;
  mealId: string;
  points: number;
  reason: 'opt_out_honoured' | 'redeem_pass' | 'adjustment';
  createdAt: Date;
  updatedAt: Date;
}

const rebateLedgerSchema = new Schema<IRebateLedgerDocument>(
  {
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
    points: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      enum: ['opt_out_honoured', 'redeem_pass', 'adjustment'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

rebateLedgerSchema.index({ userId: 1, mealId: 1, reason: 1 }, { unique: true });
rebateLedgerSchema.index({ userId: 1, createdAt: -1 });

export const RebateLedgerModel = model<IRebateLedgerDocument>('RebateLedger', rebateLedgerSchema);
