/**
 * infra/mongo/audit-event.repository.ts — MongoDB repository for AuditEvent.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.24.
 */

import type { AuditEventEntity, AuditEventRepository } from '../../core/ports';
import { AuditEventModel, type IAuditEventDocument } from './models/audit-event.model';

function toEntity(doc: IAuditEventDocument): AuditEventEntity {
  return {
    id: doc._id.toString(),
    mealId: doc.mealId,
    kind: doc.kind,
    raisedAt: doc.raisedAt,
    ackedAt: doc.ackedAt,
    outcome: doc.outcome,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoAuditEventRepository implements AuditEventRepository {
  async save(event: Omit<AuditEventEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AuditEventEntity> {
    const doc = await AuditEventModel.create({
      mealId: event.mealId.trim(),
      kind: event.kind,
      raisedAt: event.raisedAt,
      ackedAt: event.ackedAt,
      outcome: event.outcome,
    });
    return toEntity(doc);
  }

  async findById(id: string): Promise<AuditEventEntity | null> {
    const doc = await AuditEventModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async listForMeal(mealId: string): Promise<AuditEventEntity[]> {
    const docs = await AuditEventModel.find({ mealId: mealId.trim() }).sort({ raisedAt: -1 });
    return docs.map(toEntity);
  }

  async ack(id: string, ackedAt: number, outcome: 'checked' | 'skipped'): Promise<AuditEventEntity | null> {
    const doc = await AuditEventModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ackedAt,
          outcome,
        },
      },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
