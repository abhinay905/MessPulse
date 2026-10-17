/**
 * infra/mongo/meal.repository.ts — MongoDB repository for Meal.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { MealEntity, MealRepository } from '../../core/ports';
import { MealModel, type IMealDocument } from './models/meal.model';

function toEntity(doc: IMealDocument): MealEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    mealId: doc.mealId,
    type: doc.type,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    menuItems: [...doc.menuItems],
    menuDemandFactorMin: doc.menuDemandFactorMin,
    trayCapacity: doc.trayCapacity,
    autoCalibrated: doc.autoCalibrated,
    counters: doc.counters ? [...doc.counters] : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoMealRepository implements MealRepository {
  async findByMealId(messId: string, mealId: string): Promise<MealEntity | null> {
    const doc = await MealModel.findOne({ messId: messId.trim(), mealId: mealId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async findActiveAt(messId: string, now: number): Promise<MealEntity | null> {
    const doc = await MealModel.findOne({
      messId: messId.trim(),
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    });
    return doc ? toEntity(doc) : null;
  }

  async findActiveOrUpcoming(messId: string, now: number, bufferMs = 5 * 60 * 1000): Promise<MealEntity | null> {
    const doc = await MealModel.findOne({
      messId: messId.trim(),
      startsAt: { $lte: now + bufferMs },
      endsAt: { $gte: now },
    }).sort({ startsAt: 1 });
    return doc ? toEntity(doc) : null;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    const doc = await MealModel.findOneAndUpdate(
      { messId: meal.messId.trim(), mealId: meal.mealId.trim() },
      { $set: meal },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async updateTrayCapacity(messId: string, mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    const doc = await MealModel.findOneAndUpdate(
      { messId: messId.trim(), mealId: mealId.trim() },
      { $set: { trayCapacity } },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
