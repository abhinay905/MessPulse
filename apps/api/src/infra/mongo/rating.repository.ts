/**
 * infra/mongo/rating.repository.ts — MongoDB repository for Rating.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.14.
 */

import type { RatingEntity, RatingRepository } from '../../core/ports';
import { RatingModel, type IRatingDocument } from './models/rating.model';

function toEntity(doc: IRatingDocument): RatingEntity {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    userId: doc.userId,
    mealId: doc.mealId,
    stars: doc.stars,
    dishVotes: doc.dishVotes?.map((v) => ({ dish: v.dish, vote: v.vote })),
    comment: doc.comment,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoRatingRepository implements RatingRepository {
  async save(rating: Omit<RatingEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<RatingEntity> {
    const doc = await RatingModel.create({
      sessionId: rating.sessionId.trim(),
      userId: rating.userId.trim(),
      mealId: rating.mealId.trim(),
      stars: rating.stars,
      dishVotes: rating.dishVotes,
      comment: rating.comment?.trim(),
    });
    return toEntity(doc);
  }

  async findBySessionId(sessionId: string): Promise<RatingEntity | null> {
    const doc = await RatingModel.findOne({ sessionId: sessionId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async listForMeal(mealId: string): Promise<RatingEntity[]> {
    const docs = await RatingModel.find({ mealId: mealId.trim() }).sort({ createdAt: -1 });
    return docs.map(toEntity);
  }

  async listByUser(userId: string): Promise<RatingEntity[]> {
    const docs = await RatingModel.find({ userId: userId.trim() }).sort({ createdAt: -1 });
    return docs.map(toEntity);
  }
}
