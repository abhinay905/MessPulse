/**
 * infra/mongo/models/audit-event.model.ts — Mongoose AuditEvent model.
 * DOC2 §2.7.2: AuditEvent {mealId, kind:'random_audit'|'unaccounted_entries'|'device_anomaly', raisedAt, ackedAt?, outcome?:'checked'|'skipped'}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IAuditEventDocument extends Document {
  mealId: string;
  kind: 'random_audit' | 'unaccounted_entries' | 'device_anomaly';
  raisedAt: number;
  ackedAt?: number;
  outcome?: 'checked' | 'skipped';
  createdAt: Date;
  updatedAt: Date;
}

const auditEventSchema = new Schema<IAuditEventDocument>(
  {
    mealId: {
      type: String,
      required: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ['random_audit', 'unaccounted_entries', 'device_anomaly'],
      required: true,
    },
    raisedAt: {
      type: Number,
      required: true,
    },
    ackedAt: {
      type: Number,
      required: false,
    },
    outcome: {
      type: String,
      enum: ['checked', 'skipped'],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

auditEventSchema.index({ mealId: 1, raisedAt: -1 });

export const AuditEventModel = model<IAuditEventDocument>('AuditEvent', auditEventSchema);
