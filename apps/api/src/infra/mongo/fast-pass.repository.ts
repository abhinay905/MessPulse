/**
 * infra/mongo/fast-pass.repository.ts — MongoDB repository for FastPass.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.23.
 */

import type { FastPassEntity, FastPassRepository } from '../../core/ports';
import { FastPassModel, type IFastPassDocument } from './models/fast-pass.model';

function toEntity(doc: IFastPassDocument): FastPassEntity {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    mealId: doc.mealId,
    code: doc.code,
    status: doc.status,
    usedAt: doc.usedAt,
    usedBy: doc.usedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoFastPassRepository implements FastPassRepository {
  async save(pass: Omit<FastPassEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<FastPassEntity> {
    const doc = await FastPassModel.create({
      userId: pass.userId.trim(),
      mealId: pass.mealId.trim(),
      code: pass.code.trim().toUpperCase(),
      status: pass.status ?? 'issued',
      usedAt: pass.usedAt,
      usedBy: pass.usedBy?.trim(),
    });
    return toEntity(doc);
  }

  async findByCode(code: string): Promise<FastPassEntity | null> {
    const doc = await FastPassModel.findOne({ code: code.trim().toUpperCase() });
    return doc ? toEntity(doc) : null;
  }

  async findByUserMeal(userId: string, mealId: string): Promise<FastPassEntity | null> {
    const doc = await FastPassModel.findOne({ userId: userId.trim(), mealId: mealId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async markUsed(code: string, usedBy: string, usedAt: number): Promise<FastPassEntity | null> {
    const doc = await FastPassModel.findOneAndUpdate(
      { code: code.trim().toUpperCase(), status: 'issued' },
      {
        $set: {
          status: 'used',
          usedBy: usedBy.trim(),
          usedAt,
        },
      },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }

  async countForMeal(mealId: string): Promise<number> {
    return FastPassModel.countDocuments({ mealId: mealId.trim() });
  }
}
