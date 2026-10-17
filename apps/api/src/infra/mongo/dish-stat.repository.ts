/**
 * infra/mongo/dish-stat.repository.ts — MongoDB repository for DishStat.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.22.
 */

import type { DishStatEntity, DishStatRepository } from '../../core/ports';
import { DishStatModel, type IDishStatDocument } from './models/dish-stat.model';

function toEntity(doc: IDishStatDocument): DishStatEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    dish: doc.dish,
    mealType: doc.mealType,
    timesServed: doc.timesServed,
    ratingSum: doc.ratingSum,
    ratingCount: doc.ratingCount,
    upVotes: doc.upVotes,
    downVotes: doc.downVotes,
    skipDeviationSum: doc.skipDeviationSum,
    dps: doc.dps,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoDishStatRepository implements DishStatRepository {
  async upsert(stat: Omit<DishStatEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<DishStatEntity> {
    const doc = await DishStatModel.findOneAndUpdate(
      {
        messId: stat.messId.trim(),
        dish: stat.dish.trim(),
        mealType: stat.mealType.trim(),
      },
      {
        $set: {
          timesServed: stat.timesServed,
          ratingSum: stat.ratingSum,
          ratingCount: stat.ratingCount,
          upVotes: stat.upVotes,
          downVotes: stat.downVotes,
          skipDeviationSum: stat.skipDeviationSum,
          dps: stat.dps,
        },
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async findByDish(messId: string, dish: string, mealType: string): Promise<DishStatEntity | null> {
    const doc = await DishStatModel.findOne({
      messId: messId.trim(),
      dish: dish.trim(),
      mealType: mealType.trim(),
    });
    return doc ? toEntity(doc) : null;
  }

  async listLeaderboard(messId: string, limit = 50): Promise<DishStatEntity[]> {
    const docs = await DishStatModel.find({ messId: messId.trim() })
      .sort({ dps: -1, ratingCount: -1 })
      .limit(limit);
    return docs.map(toEntity);
  }

  async incrementRating(
    messId: string,
    dish: string,
    mealType: string,
    stars: number,
    upVote?: boolean,
    downVote?: boolean
  ): Promise<DishStatEntity> {
    const inc: Record<string, number> = {
      ratingSum: stars,
      ratingCount: 1,
    };
    if (upVote) inc['upVotes'] = 1;
    if (downVote) inc['downVotes'] = 1;

    const doc = await DishStatModel.findOneAndUpdate(
      {
        messId: messId.trim(),
        dish: dish.trim(),
        mealType: mealType.trim(),
      },
      {
        $inc: inc,
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async updateDps(
    messId: string,
    dish: string,
    mealType: string,
    dps: number | null,
    skipDeviation?: number
  ): Promise<DishStatEntity | null> {
    const update: Record<string, unknown> = { dps };
    if (skipDeviation !== undefined) {
      update['$inc'] = { skipDeviationSum: skipDeviation };
    }
    const doc = await DishStatModel.findOneAndUpdate(
      {
        messId: messId.trim(),
        dish: dish.trim(),
        mealType: mealType.trim(),
      },
      update,
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
