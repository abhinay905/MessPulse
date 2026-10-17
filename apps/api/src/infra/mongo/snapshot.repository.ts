/**
 * infra/mongo/snapshot.repository.ts — MongoDB repository for OccupancySnapshot.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { OccupancySnapshotEntity, SnapshotRepository } from '../../core/ports';
import { OccupancySnapshotModel, type IOccupancySnapshotDocument } from './models/occupancy-snapshot.model';

function toEntity(doc: IOccupancySnapshotDocument): OccupancySnapshotEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    mealId: doc.mealId,
    ts: doc.ts,
    cameraCount: doc.cameraCount,
    sessionEstimate: doc.sessionEstimate,
    decayWeighted: doc.decayWeighted,
    estWaitMin: doc.estWaitMin,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoSnapshotRepository implements SnapshotRepository {
  async save(snapshot: Omit<OccupancySnapshotEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await OccupancySnapshotModel.create(snapshot);
  }

  async queryHistory(messId: string, fromTs: number, toTs: number): Promise<OccupancySnapshotEntity[]> {
    const docs = await OccupancySnapshotModel.find({
      messId: messId.trim(),
      ts: { $gte: fromTs, $lte: toTs },
    }).sort({ ts: 1 });
    return docs.map(toEntity);
  }

  async getLatest(messId: string): Promise<OccupancySnapshotEntity | null> {
    const doc = await OccupancySnapshotModel.findOne({ messId: messId.trim() }).sort({ ts: -1 });
    return doc ? toEntity(doc) : null;
  }
}
