/**
 * infra/mongo/tray-hold.repository.ts — MongoDB repository for TrayHold.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.21.
 */

import type { TrayHoldEntity, TrayHoldRepository } from '../../core/ports';
import { TrayHoldModel, type ITrayHoldDocument } from './models/tray-hold.model';

function toEntity(doc: ITrayHoldDocument): TrayHoldEntity {
  return {
    id: doc._id.toString(),
    mealId: doc.mealId,
    counterId: doc.counterId,
    dish: doc.dish,
    reportId: doc.reportId,
    status: doc.status,
    releasedBy: doc.releasedBy,
    releasedAt: doc.releasedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoTrayHoldRepository implements TrayHoldRepository {
  async save(hold: Omit<TrayHoldEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<TrayHoldEntity> {
    const doc = await TrayHoldModel.create({
      mealId: hold.mealId.trim(),
      counterId: hold.counterId?.trim(),
      dish: hold.dish?.trim(),
      reportId: hold.reportId.trim(),
      status: hold.status ?? 'held',
      releasedBy: hold.releasedBy?.trim(),
      releasedAt: hold.releasedAt,
    });
    return toEntity(doc);
  }

  async findById(id: string): Promise<TrayHoldEntity | null> {
    const doc = await TrayHoldModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async findActiveByReportId(reportId: string): Promise<TrayHoldEntity | null> {
    const doc = await TrayHoldModel.findOne({ reportId: reportId.trim(), status: 'held' });
    return doc ? toEntity(doc) : null;
  }

  async list(options?: { status?: 'held' | 'released'; mealId?: string; limit?: number }): Promise<TrayHoldEntity[]> {
    const filter: Record<string, unknown> = {};
    if (options?.status) {
      filter['status'] = options.status;
    }
    if (options?.mealId) {
      filter['mealId'] = options.mealId.trim();
    }
    let query = TrayHoldModel.find(filter).sort({ createdAt: -1 });
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    const docs = await query;
    return docs.map(toEntity);
  }

  async release(id: string, releasedBy: string, releasedAt: number): Promise<TrayHoldEntity | null> {
    const doc = await TrayHoldModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'released',
          releasedBy: releasedBy.trim(),
          releasedAt,
        },
      },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
