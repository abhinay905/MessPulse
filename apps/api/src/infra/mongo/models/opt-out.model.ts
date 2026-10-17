/**
 * infra/mongo/models/opt-out.model.ts — Mongoose OptOut model.
 * DOC2 §2.7.2: OptOut {userId, mealId, createdAt} unique(userId, mealId)
 */

import { Schema, model, type Document } from 'mongoose';

export interface IOptOutDocument extends Document {
  userId: string;
  mealId: string;
  createdAt: Date;
  updatedAt: Date;
}

const optOutSchema = new Schema<IOptOutDocument>(
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
  },
  {
    timestamps: true,
  }
);

optOutSchema.index({ userId: 1, mealId: 1 }, { unique: true });
optOutSchema.index({ mealId: 1 });

export const OptOutModel = model<IOptOutDocument>('OptOut', optOutSchema);
