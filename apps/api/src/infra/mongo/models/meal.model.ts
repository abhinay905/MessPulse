/**
 * infra/mongo/models/meal.model.ts — Mongoose Meal model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface IMealDocument extends Document {
  messId: string;
  mealId: string;
  type: string;
  startsAt: number;
  endsAt: number;
  menuItems: string[];
  menuDemandFactorMin: number;
  trayCapacity?: number | undefined;
  autoCalibrated?: boolean | undefined;
  counters?: string[] | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const mealSchema = new Schema<IMealDocument>(
  {
    messId: {
      type: String,
      required: true,
      trim: true,
    },
    mealId: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    startsAt: {
      type: Number,
      required: true,
    },
    endsAt: {
      type: Number,
      required: true,
    },
    menuItems: {
      type: [String],
      required: true,
      default: [],
    },
    menuDemandFactorMin: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 5,
    },
    trayCapacity: {
      type: Number,
      required: false,
    },
    autoCalibrated: {
      type: Boolean,
      required: false,
      default: false,
    },
    counters: {
      type: [String],
      required: false,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

mealSchema.index({ messId: 1, mealId: 1 }, { unique: true });

export const MealModel = model<IMealDocument>('Meal', mealSchema);
