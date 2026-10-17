/**
 * infra/mongo/meal-summary.repository.ts — MongoDB repository for MealSummary.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.15.
 */

import type { MealSummaryEntity, MealSummaryRepository } from '../../core/ports';
import { MealSummaryModel, type IMealSummaryDocument } from './models/meal-summary.model';

function toEntity(doc: IMealSummaryDocument): MealSummaryEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    mealId: doc.mealId,
    type: doc.type,
    dayOfWeek: doc.dayOfWeek,
    totalEntries: doc.totalEntries,
    peakOccupancy: doc.peakOccupancy,
    optOutCount: doc.optOutCount,
    enrolledCount: doc.enrolledCount,
    appCheckIns: doc.appCheckIns,
    adoptionRatio: doc.adoptionRatio,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoMealSummaryRepository implements MealSummaryRepository {
  async save(summary: Omit<MealSummaryEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealSummaryEntity> {
    const doc = await MealSummaryModel.findOneAndUpdate(
      { mealId: summary.mealId.trim() },
      {
        $set: {
          messId: summary.messId.trim(),
          type: summary.type.trim(),
          dayOfWeek: summary.dayOfWeek,
          totalEntries: summary.totalEntries,
          peakOccupancy: summary.peakOccupancy,
          optOutCount: summary.optOutCount,
          enrolledCount: summary.enrolledCount,
          appCheckIns: summary.appCheckIns,
          adoptionRatio: summary.adoptionRatio,
        },
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async findByMealId(mealId: string): Promise<MealSummaryEntity | null> {
    const doc = await MealSummaryModel.findOne({ mealId: mealId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async listHistory(
    messId: string,
    mealType: string,
    dayOfWeek: number,
    limit = 14
  ): Promise<MealSummaryEntity[]> {
    const docs = await MealSummaryModel.find({
      messId: messId.trim(),
      type: mealType.trim(),
      dayOfWeek,
    })
      .sort({ createdAt: -1 })
      .limit(limit);
    return docs.map(toEntity);
  }
}
