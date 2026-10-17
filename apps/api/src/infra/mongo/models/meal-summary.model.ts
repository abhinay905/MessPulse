/**
 * infra/mongo/models/meal-summary.model.ts — Mongoose MealSummary model.
 * DOC2 §2.7.2: MealSummary {messId, mealId (unique), type, dayOfWeek, totalEntries, peakOccupancy, optOutCount, enrolledCount, appCheckIns, adoptionRatio}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IMealSummaryDocument extends Document {
  messId: string;
  mealId: string;
  type: string;
  dayOfWeek: number;
  totalEntries: number;
  peakOccupancy: number;
  optOutCount: number;
  enrolledCount: number;
  appCheckIns: number;
  adoptionRatio: number;
  createdAt: Date;
  updatedAt: Date;
}

const mealSummarySchema = new Schema<IMealSummaryDocument>(
  {
    messId: {
      type: String,
      required: true,
      trim: true,
    },
    mealId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    totalEntries: {
      type: Number,
      required: true,
      min: 0,
    },
    peakOccupancy: {
      type: Number,
      required: true,
      min: 0,
    },
    optOutCount: {
      type: Number,
      required: true,
      min: 0,
    },
    enrolledCount: {
      type: Number,
      required: true,
      min: 1,
    },
    appCheckIns: {
      type: Number,
      required: true,
      min: 0,
    },
    adoptionRatio: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
  }
);

mealSummarySchema.index({ messId: 1, type: 1, dayOfWeek: 1 });

export const MealSummaryModel = model<IMealSummaryDocument>('MealSummary', mealSummarySchema);
