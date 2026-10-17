/**
 * infra/mongo/opt-out.repository.ts — MongoDB repository for OptOut.
 * DOC3 §3.12, DOC3 §3.13.
 */

import type { OptOutEntity, OptOutRepository } from '../../core/ports';
import { OptOutModel, type IOptOutDocument } from './models/opt-out.model';

function toEntity(doc: IOptOutDocument): OptOutEntity {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    mealId: doc.mealId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoOptOutRepository implements OptOutRepository {
  async upsert(userId: string, mealId: string, createdAt?: Date): Promise<OptOutEntity> {
    const update: Record<string, unknown> = { userId: userId.trim(), mealId: mealId.trim() };
    if (createdAt) update['createdAt'] = createdAt;

    const doc = await OptOutModel.findOneAndUpdate(
      { userId: userId.trim(), mealId: mealId.trim() },
      { $set: update },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async remove(userId: string, mealId: string): Promise<boolean> {
    const res = await OptOutModel.deleteOne({ userId: userId.trim(), mealId: mealId.trim() });
    return (res.deletedCount ?? 0) > 0;
  }

  async findByUserMeal(userId: string, mealId: string): Promise<OptOutEntity | null> {
    const doc = await OptOutModel.findOne({ userId: userId.trim(), mealId: mealId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async countByMeal(mealId: string): Promise<number> {
    return OptOutModel.countDocuments({ mealId: mealId.trim() });
  }
}
