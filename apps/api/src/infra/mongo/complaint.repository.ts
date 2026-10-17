/**
 * infra/mongo/complaint.repository.ts — MongoDB repository for Complaint.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.16.
 */

import type { ComplaintEntity, ComplaintRepository } from '../../core/ports';
import { ComplaintModel, type IComplaintDocument } from './models/complaint.model';

function toEntity(doc: IComplaintDocument): ComplaintEntity {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    userId: doc.userId,
    mealId: doc.mealId,
    tier: doc.tier,
    category: doc.category,
    note: doc.note,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoComplaintRepository implements ComplaintRepository {
  async save(complaint: Omit<ComplaintEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComplaintEntity> {
    const doc = await ComplaintModel.create({
      sessionId: complaint.sessionId.trim(),
      userId: complaint.userId.trim(),
      mealId: complaint.mealId.trim(),
      tier: complaint.tier ?? 1,
      category: complaint.category,
      note: complaint.note?.trim(),
    });
    return toEntity(doc);
  }

  async findDuplicate(sessionId: string, category: string): Promise<ComplaintEntity | null> {
    const doc = await ComplaintModel.findOne({
      sessionId: sessionId.trim(),
      category: category as ComplaintEntity['category'],
    });
    return doc ? toEntity(doc) : null;
  }

  async listForMeal(mealId: string, options?: { limit?: number }): Promise<ComplaintEntity[]> {
    let query = ComplaintModel.find({ mealId: mealId.trim() }).sort({ createdAt: -1 });
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    const docs = await query;
    return docs.map(toEntity);
  }

  async countByMealCategory(mealId: string, category: string, sinceMs: number): Promise<number> {
    return ComplaintModel.countDocuments({
      mealId: mealId.trim(),
      category: category as ComplaintEntity['category'],
      createdAt: { $gte: new Date(sinceMs) },
    });
  }
}
