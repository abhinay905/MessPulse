/**
 * infra/mongo/rebate-ledger.repository.ts — MongoDB repository for RebateLedger.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.23.
 */

import type { RebateLedgerEntity, RebateLedgerRepository } from '../../core/ports';
import { RebateLedgerModel, type IRebateLedgerDocument } from './models/rebate-ledger.model';

function toEntity(doc: IRebateLedgerDocument): RebateLedgerEntity {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    mealId: doc.mealId,
    points: doc.points,
    reason: doc.reason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoRebateLedgerRepository implements RebateLedgerRepository {
  async save(entry: Omit<RebateLedgerEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<RebateLedgerEntity> {
    const doc = await RebateLedgerModel.create({
      userId: entry.userId.trim(),
      mealId: entry.mealId.trim(),
      points: entry.points,
      reason: entry.reason,
    });
    return toEntity(doc);
  }

  async getBalance(userId: string): Promise<number> {
    const res = await RebateLedgerModel.aggregate<{ total: number }>([
      { $match: { userId: userId.trim() } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]);
    return res[0]?.total ?? 0;
  }

  async getHistory(userId: string): Promise<RebateLedgerEntity[]> {
    const docs = await RebateLedgerModel.find({ userId: userId.trim() }).sort({ createdAt: -1 });
    return docs.map(toEntity);
  }

  async countViolations(userId: string): Promise<number> {
    return RebateLedgerModel.countDocuments({
      userId: userId.trim(),
      $or: [{ reason: 'adjustment' as const, points: { $lt: 0 } }, { points: { $lt: 0 } }],
    });
  }
}
