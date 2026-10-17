/**
 * infra/mongo/models/push-subscription.model.ts — Mongoose PushSubscription model.
 * DOC2 §2.7.2: PushSubscription {userId, endpoint (unique), keys{p256dh, auth}, userAgent?}
 */

import { Schema, model, type Document } from 'mongoose';

export interface IPushSubscriptionDocument extends Document {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscriptionDocument>(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

pushSubscriptionSchema.index({ userId: 1 });

export const PushSubscriptionModel = model<IPushSubscriptionDocument>(
  'PushSubscription',
  pushSubscriptionSchema
);
