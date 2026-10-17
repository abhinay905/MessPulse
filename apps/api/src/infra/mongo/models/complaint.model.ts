/**
 * infra/mongo/models/complaint.model.ts — Mongoose Complaint model.
 * DOC2 §2.7.2: Complaint {sessionId, userId, mealId, tier:1, category:'cold_food'|'undercooked'|'oversalted'|'stale'|'quantity'|'other', note?}
 * unique(sessionId, category); index (mealId, category, createdAt)
 */

import { Schema, model, type Document } from 'mongoose';

export interface IComplaintDocument extends Document {
  sessionId: string;
  userId: string;
  mealId: string;
  tier: 1;
  category: 'cold_food' | 'undercooked' | 'oversalted' | 'stale' | 'quantity' | 'other';
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const complaintSchema = new Schema<IComplaintDocument>(
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
    tier: {
      type: Number,
      required: true,
      default: 1,
    },
    category: {
      type: String,
      enum: ['cold_food', 'undercooked', 'oversalted', 'stale', 'quantity', 'other'],
      required: true,
    },
    note: {
      type: String,
      required: false,
      maxlength: 280,
    },
  },
  {
    timestamps: true,
  }
);

complaintSchema.index({ sessionId: 1, category: 1 }, { unique: true });
complaintSchema.index({ mealId: 1, category: 1, createdAt: 1 });

export const ComplaintModel = model<IComplaintDocument>('Complaint', complaintSchema);
