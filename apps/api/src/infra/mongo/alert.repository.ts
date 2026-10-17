/**
 * infra/mongo/alert.repository.ts — MongoDB repository for Alert.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { AlertEntity, AlertRepository } from '../../core/ports';
import { AlertModel, type IAlertDocument } from './models/alert.model';

function toEntity(doc: IAlertDocument): AlertEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    mealId: doc.mealId,
    ruleId: doc.ruleId,
    severity: doc.severity,
    payload: (doc.payload as Record<string, unknown>) || {},
    raisedAt: doc.raisedAt,
    ackedBy: doc.ackedBy,
    ackedAt: doc.ackedAt,
    clearedAt: doc.clearedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoAlertRepository implements AlertRepository {
  async create(alert: Omit<AlertEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertEntity> {
    const doc = await AlertModel.create(alert);
    return toEntity(doc);
  }

  async findOpen(messId: string, mealId: string, ruleId: string): Promise<AlertEntity | null> {
    const doc = await AlertModel.findOne({
      messId: messId.trim(),
      mealId: mealId.trim(),
      ruleId: ruleId.trim(),
      clearedAt: { $exists: false },
    });
    return doc ? toEntity(doc) : null;
  }

  async list(messId: string, options: { openOnly?: boolean; limit?: number } = {}): Promise<AlertEntity[]> {
    const filter: Record<string, unknown> = { messId: messId.trim() };
    if (options.openOnly) {
      filter['clearedAt'] = { $exists: false };
    }

    const query = AlertModel.find(filter).sort({ raisedAt: -1 });
    if (options.limit && options.limit > 0) {
      query.limit(options.limit);
    }

    const docs = await query.exec();
    return docs.map(toEntity);
  }

  async ack(alertId: string, ackedBy: string, ackedAt: number): Promise<AlertEntity | null> {
    const doc = await AlertModel.findByIdAndUpdate(
      alertId,
      { $set: { ackedBy, ackedAt } },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }

  async clear(alertId: string, clearedAt: number): Promise<AlertEntity | null> {
    const doc = await AlertModel.findByIdAndUpdate(
      alertId,
      { $set: { clearedAt } },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
