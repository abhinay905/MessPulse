/**
 * infra/mongo/models/rating.model.ts — Mongoose Rating model.
 * DOC2 §2.7.2: Rating {sessionId (unique), userId, mealId, stars 1–5, dishVotes[{dish, vote:'up'|'down'}]?, comment? (≤280)}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IRatingDocument extends Document {
  sessionId: string;
  userId: string;
  mealId: string;
  stars: number;
  dishVotes?: Array<{ dish: string; vote: 'up' | 'down' }>;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ratingSchema = new Schema<IRatingDocument>(
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
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    dishVotes: [
      {
        dish: { type: String, required: true },
        vote: { type: String, enum: ['up', 'down'], required: true },
      },
    ],
    comment: {
      type: String,
      required: false,
      maxlength: 280,
    },
  },
  {
    timestamps: true,
  }
);

ratingSchema.index({ mealId: 1 });
ratingSchema.index({ userId: 1 });

export const RatingModel = model<IRatingDocument>('Rating', ratingSchema);
