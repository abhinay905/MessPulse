/**
 * infra/mongo/models/timetable-break.model.ts — Mongoose TimetableBreak model.
 * DOC2 §2.7.2: TimetableBreak {messId, dayOfWeek 0–6, startsAt 'HH:mm', endsAt 'HH:mm', label}
 */

import { Schema, model, type Document } from 'mongoose';

export interface ITimetableBreakDocument extends Document {
  messId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

const timetableBreakSchema = new Schema<ITimetableBreakDocument>(
  {
    messId: {
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
    startsAt: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },
    endsAt: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

timetableBreakSchema.index({ messId: 1, dayOfWeek: 1 });

export const TimetableBreakModel = model<ITimetableBreakDocument>('TimetableBreak', timetableBreakSchema);
