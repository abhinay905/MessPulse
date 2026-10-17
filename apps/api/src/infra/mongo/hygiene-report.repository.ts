/**
 * infra/mongo/hygiene-report.repository.ts — MongoDB repository for HygieneReport.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.21.
 */

import type { HygieneReportEntity, HygieneReportRepository } from '../../core/ports';
import { HygieneReportModel, type IHygieneReportDocument } from './models/hygiene-report.model';

function toEntity(doc: IHygieneReportDocument): HygieneReportEntity {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    userId: doc.userId,
    mealId: doc.mealId,
    kind: doc.kind,
    imageKey: doc.imageKey,
    note: doc.note,
    counterId: doc.counterId,
    dish: doc.dish,
    status: doc.status,
    resolvedBy: doc.resolvedBy,
    resolutionNote: doc.resolutionNote,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoHygieneReportRepository implements HygieneReportRepository {
  async save(report: Omit<HygieneReportEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<HygieneReportEntity> {
    const doc = await HygieneReportModel.create({
      sessionId: report.sessionId.trim(),
      userId: report.userId.trim(),
      mealId: report.mealId.trim(),
      kind: report.kind,
      imageKey: report.imageKey,
      note: report.note?.trim(),
      counterId: report.counterId?.trim(),
      dish: report.dish?.trim(),
      status: report.status ?? 'open',
      resolvedBy: report.resolvedBy?.trim(),
      resolutionNote: report.resolutionNote?.trim(),
    });
    return toEntity(doc);
  }

  async findById(id: string): Promise<HygieneReportEntity | null> {
    const doc = await HygieneReportModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async list(options?: { status?: 'open' | 'resolved'; limit?: number }): Promise<HygieneReportEntity[]> {
    const filter: Record<string, unknown> = {};
    if (options?.status) {
      filter['status'] = options.status;
    }
    let query = HygieneReportModel.find(filter).sort({ createdAt: -1 });
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    const docs = await query;
    return docs.map(toEntity);
  }

  async resolve(id: string, resolvedBy: string, resolutionNote: string): Promise<HygieneReportEntity | null> {
    const doc = await HygieneReportModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'resolved',
          resolvedBy: resolvedBy.trim(),
          resolutionNote: resolutionNote.trim(),
        },
      },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }

  async countTodayByUser(userId: string, now: number): Promise<number> {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    return HygieneReportModel.countDocuments({
      userId: userId.trim(),
      createdAt: { $gte: startOfDay },
    });
  }
}
