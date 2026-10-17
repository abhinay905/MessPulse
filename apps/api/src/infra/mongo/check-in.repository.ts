/**
 * infra/mongo/check-in.repository.ts — MongoDB repository for CheckIn archives.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { AnyBulkWriteOperation } from 'mongoose';
import type { CheckInEntity, CheckInRepository } from '../../core/ports';
import { CheckInModel, type ICheckInDocument } from './models/check-in.model';

function toEntity(doc: ICheckInDocument): CheckInEntity {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    userId: doc.userId,
    mealId: doc.mealId,
    checkedInAt: doc.checkedInAt,
    queueWaitSecAtEntry: doc.queueWaitSecAtEntry,
    expectedStaySec: doc.expectedStaySec,
    hardExpirySec: doc.hardExpirySec,
    method: doc.method,
    geofence: doc.geofence,
    endedAt: doc.endedAt,
    endReason: doc.endReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoCheckInRepository implements CheckInRepository {
  async archive(checkIn: Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await CheckInModel.updateOne(
      { sessionId: checkIn.sessionId },
      { $setOnInsert: checkIn },
      { upsert: true }
    );
  }

  async archiveMany(checkIns: Array<Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    if (checkIns.length === 0) {
      return;
    }

    const ops: AnyBulkWriteOperation<ICheckInDocument>[] = checkIns.map((c) => ({
      updateOne: {
        filter: { sessionId: c.sessionId },
        update: { $setOnInsert: c },
        upsert: true,
      },
    }));

    await CheckInModel.bulkWrite(ops, { ordered: false });
  }

  async findBySessionId(sessionId: string): Promise<CheckInEntity | null> {
    const doc = await CheckInModel.findOne({ sessionId: sessionId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async listForMeal(mealId: string): Promise<CheckInEntity[]> {
    const docs = await CheckInModel.find({ mealId: mealId.trim() }).sort({ checkedInAt: 1 });
    return docs.map(toEntity);
  }
}
