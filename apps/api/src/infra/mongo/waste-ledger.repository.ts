/**
 * infra/mongo/waste-ledger.repository.ts — MongoDB repository for WasteLedger.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.15.
 */

import type { WasteLedgerEntity, WasteLedgerRepository } from '../../core/ports';
import { WasteLedgerModel, type IWasteLedgerDocument } from './models/waste-ledger.model';

function toEntity(doc: IWasteLedgerDocument): WasteLedgerEntity {
  return {
    id: doc._id.toString(),
    mealId: doc.mealId,
    cookedPortions: doc.cookedPortions,
    leftoverPortions: doc.leftoverPortions,
    advisorUsed: doc.advisorUsed,
    recordedBy: doc.recordedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoWasteLedgerRepository implements WasteLedgerRepository {
  async save(entry: Omit<WasteLedgerEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<WasteLedgerEntity> {
    const doc = await WasteLedgerModel.findOneAndUpdate(
      { mealId: entry.mealId.trim() },
      {
        $set: {
          cookedPortions: entry.cookedPortions,
          leftoverPortions: entry.leftoverPortions,
          advisorUsed: entry.advisorUsed,
          recordedBy: entry.recordedBy.trim(),
        },
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async findByMealId(mealId: string): Promise<WasteLedgerEntity | null> {
    const doc = await WasteLedgerModel.findOne({ mealId: mealId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async listRecent(limit = 20): Promise<WasteLedgerEntity[]> {
    const docs = await WasteLedgerModel.find().sort({ createdAt: -1 }).limit(limit);
    return docs.map(toEntity);
  }
}
