/**
 * infra/mongo/models/dish-stat.model.ts — Mongoose DishStat model.
 * DOC2 §2.7.2: DishStat {messId, dish, mealType, timesServed, ratingSum, ratingCount, upVotes, downVotes, skipDeviationSum, dps 0–100, updatedAt}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IDishStatDocument extends Document {
  messId: string;
  dish: string;
  mealType: string;
  timesServed: number;
  ratingSum: number;
  ratingCount: number;
  upVotes: number;
  downVotes: number;
  skipDeviationSum: number;
  dps: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const dishStatSchema = new Schema<IDishStatDocument>(
  {
    messId: {
      type: String,
      required: true,
      trim: true,
    },
    dish: {
      type: String,
      required: true,
      trim: true,
    },
    mealType: {
      type: String,
      required: true,
      trim: true,
    },
    timesServed: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    ratingSum: {
      type: Number,
      required: true,
      default: 0,
    },
    ratingCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    upVotes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    downVotes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    skipDeviationSum: {
      type: Number,
      required: true,
      default: 0,
    },
    dps: {
      type: Number,
      required: false,
      default: null,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

dishStatSchema.index({ messId: 1, dish: 1, mealType: 1 }, { unique: true });
dishStatSchema.index({ messId: 1, dps: -1 });

export const DishStatModel = model<IDishStatDocument>('DishStat', dishStatSchema);
