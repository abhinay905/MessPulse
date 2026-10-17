/**
 * infra/mongo/models/hygiene-report.model.ts — Mongoose HygieneReport model.
 * DOC2 §2.7.2: HygieneReport {sessionId, userId, mealId, kind:'foreign_object'|'insect'|'other', imageKey, note?, counterId?, dish?, status:'open'|'resolved', resolvedBy?, resolutionNote?}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IHygieneReportDocument extends Document {
  sessionId: string;
  userId: string;
  mealId: string;
  kind: 'foreign_object' | 'insect' | 'other';
  imageKey: string;
  note?: string;
  counterId?: string;
  dish?: string;
  status: 'open' | 'resolved';
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const hygieneReportSchema = new Schema<IHygieneReportDocument>(
  {
    sessionId: {
      type: String,
      required: true,
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
    kind: {
      type: String,
      enum: ['foreign_object', 'insect', 'other'],
      required: true,
    },
    imageKey: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      required: false,
      maxlength: 280,
    },
    counterId: {
      type: String,
      required: false,
    },
    dish: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      required: true,
      default: 'open',
    },
    resolvedBy: {
      type: String,
      required: false,
    },
    resolutionNote: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

hygieneReportSchema.index({ userId: 1, createdAt: -1 });
hygieneReportSchema.index({ status: 1 });
hygieneReportSchema.index({ mealId: 1 });

export const HygieneReportModel = model<IHygieneReportDocument>('HygieneReport', hygieneReportSchema);
