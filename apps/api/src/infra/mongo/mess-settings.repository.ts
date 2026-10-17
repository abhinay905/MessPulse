/**
 * infra/mongo/mess-settings.repository.ts — MongoDB repository for MessSettings.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { MessSettingsEntity, SettingsRepository } from '../../core/ports';
import { MessSettingsModel, type IMessSettingsDocument } from './models/mess-settings.model';

function toEntity(doc: IMessSettingsDocument): MessSettingsEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    name: doc.name,
    seatCapacity: doc.seatCapacity,
    servicePerMin: doc.servicePerMin,
    geofence: {
      lat: doc.geofence.lat,
      lng: doc.geofence.lng,
      radiusM: doc.geofence.radiusM,
    },
    baseMealMin: doc.baseMealMin,
    maxSessionMin: doc.maxSessionMin,
    decay: {
      tail: doc.decay.tail.map((t) => ({ untilOffsetMin: t.untilOffsetMin, weight: t.weight })),
    },
    staleCameraSec: doc.staleCameraSec,
    alertThresholds: (doc.alertThresholds as Record<string, unknown>) || {},
    enrolledCount: doc.enrolledCount,
    defaultEatRate: doc.defaultEatRate,
    portionsPerPerson: doc.portionsPerPerson,
    safetyMarginPct: doc.safetyMarginPct,
    counters: doc.counters?.map((c) => ({ id: c.id, label: c.label, servicePerMin: c.servicePerMin })),
    optOutCutoffMin: doc.optOutCutoffMin,
    ratingDelayMin: doc.ratingDelayMin,
    walkToMessMin: doc.walkToMessMin,
    batchQuality: doc.batchQuality,
    unaccounted: doc.unaccounted,
    randomAudit: doc.randomAudit,
    deviceAnomaly: doc.deviceAnomaly,
    rebate: doc.rebate,
    autoCalibrateDemand: doc.autoCalibrateDemand,
    dpsWeights: doc.dpsWeights,
    imageRetentionDays: doc.imageRetentionDays,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoSettingsRepository implements SettingsRepository {
  async getByMessId(messId: string): Promise<MessSettingsEntity | null> {
    const doc = await MessSettingsModel.findOne({ messId: messId.trim() });
    return doc ? toEntity(doc) : null;
  }

  async upsert(settings: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    const doc = await MessSettingsModel.findOneAndUpdate(
      { messId: settings.messId.trim() },
      { $set: settings },
      { upsert: true, new: true }
    );
    return toEntity(doc);
  }
}
