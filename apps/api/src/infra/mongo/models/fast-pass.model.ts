/**
 * infra/mongo/models/fast-pass.model.ts — Mongoose FastPass model.
 * DOC2 §2.7.2: FastPass {userId, mealId, code (4 chars), status:'issued'|'used'|'expired', usedAt?, usedBy?} unique(userId, mealId)
 */

import { Schema, model, type Document } from 'mongoose';

export interface IFastPassDocument extends Document {
  userId: string;
  mealId: string;
  code: string;
  status: 'issued' | 'used' | 'expired';
  usedAt?: number;
  usedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fastPassSchema = new Schema<IFastPassDocument>(
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
    code: {
      type: String,
      required: true,
      trim: true,
      length: 4,
    },
    status: {
      type: String,
      enum: ['issued', 'used', 'expired'],
      required: true,
      default: 'issued',
    },
    usedAt: {
      type: Number,
      required: false,
    },
    usedBy: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

fastPassSchema.index({ userId: 1, mealId: 1 }, { unique: true });
fastPassSchema.index({ code: 1 });

export const FastPassModel = model<IFastPassDocument>('FastPass', fastPassSchema);
