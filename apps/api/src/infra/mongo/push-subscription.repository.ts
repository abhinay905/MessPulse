/**
 * infra/mongo/push-subscription.repository.ts — MongoDB repository for PushSubscription.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.20.
 */

import type { PushSubscriptionEntity, PushSubscriptionRepository } from '../../core/ports';
import { PushSubscriptionModel, type IPushSubscriptionDocument } from './models/push-subscription.model';

function toEntity(doc: IPushSubscriptionDocument): PushSubscriptionEntity {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    endpoint: doc.endpoint,
    keys: {
      p256dh: doc.keys.p256dh,
      auth: doc.keys.auth,
    },
    userAgent: doc.userAgent,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoPushSubscriptionRepository implements PushSubscriptionRepository {
  async save(
    subscription: Omit<PushSubscriptionEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PushSubscriptionEntity> {
    const doc = await PushSubscriptionModel.findOneAndUpdate(
      { endpoint: subscription.endpoint.trim() },
      {
        $set: {
          userId: subscription.userId.trim(),
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          userAgent: subscription.userAgent?.trim(),
        },
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionEntity | null> {
    const doc = await PushSubscriptionModel.findOne({ endpoint: endpoint.trim() });
    return doc ? toEntity(doc) : null;
  }

  async listByUser(userId: string): Promise<PushSubscriptionEntity[]> {
    const docs = await PushSubscriptionModel.find({ userId: userId.trim() }).sort({ createdAt: -1 });
    return docs.map(toEntity);
  }

  async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const res = await PushSubscriptionModel.deleteOne({ endpoint: endpoint.trim() });
    return (res.deletedCount ?? 0) > 0;
  }

  async deleteByUser(userId: string): Promise<number> {
    const res = await PushSubscriptionModel.deleteMany({ userId: userId.trim() });
    return res.deletedCount ?? 0;
  }
}
