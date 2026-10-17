/**
 * infra/mongo/device-sighting.repository.ts — MongoDB repository for DeviceSighting.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.24.
 */

import type { DeviceSightingEntity, DeviceSightingRepository } from '../../core/ports';
import { DeviceSightingModel, type IDeviceSightingDocument } from './models/device-sighting.model';

function toEntity(doc: IDeviceSightingDocument): DeviceSightingEntity {
  return {
    id: doc._id.toString(),
    deviceId: doc.deviceId,
    userId: doc.userId,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoDeviceSightingRepository implements DeviceSightingRepository {
  async record(deviceId: string, userId: string, now: number): Promise<DeviceSightingEntity> {
    const doc = await DeviceSightingModel.findOneAndUpdate(
      { deviceId: deviceId.trim(), userId: userId.trim() },
      {
        $setOnInsert: { firstSeenAt: now },
        $set: { lastSeenAt: now },
      },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }

  async listForDevice(deviceId: string, sinceMs: number): Promise<DeviceSightingEntity[]> {
    const docs = await DeviceSightingModel.find({
      deviceId: deviceId.trim(),
      lastSeenAt: { $gte: sinceMs },
    });
    return docs.map(toEntity);
  }

  async listForUser(userId: string, sinceMs: number): Promise<DeviceSightingEntity[]> {
    const docs = await DeviceSightingModel.find({
      userId: userId.trim(),
      lastSeenAt: { $gte: sinceMs },
    });
    return docs.map(toEntity);
  }
}
