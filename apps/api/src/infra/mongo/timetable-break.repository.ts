/**
 * infra/mongo/timetable-break.repository.ts — MongoDB repository for TimetableBreak.
 * DOC2 §2.7.2, DOC3 §3.12, DOC3 §3.18.
 */

import type { TimetableBreakEntity, TimetableBreakRepository } from '../../core/ports';
import { TimetableBreakModel, type ITimetableBreakDocument } from './models/timetable-break.model';

function toEntity(doc: ITimetableBreakDocument): TimetableBreakEntity {
  return {
    id: doc._id.toString(),
    messId: doc.messId,
    dayOfWeek: doc.dayOfWeek,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    label: doc.label,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoTimetableBreakRepository implements TimetableBreakRepository {
  async replaceForMess(
    messId: string,
    breaks: Array<Omit<TimetableBreakEntity, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<TimetableBreakEntity[]> {
    const trimmedMessId = messId.trim();
    await TimetableBreakModel.deleteMany({ messId: trimmedMessId });

    if (breaks.length === 0) {
      return [];
    }

    const docs = await TimetableBreakModel.insertMany(
      breaks.map((b) => ({
        messId: trimmedMessId,
        dayOfWeek: b.dayOfWeek,
        startsAt: b.startsAt.trim(),
        endsAt: b.endsAt.trim(),
        label: b.label.trim(),
      }))
    );

    return docs.map((d) => toEntity(d as unknown as ITimetableBreakDocument));
  }

  async listForMess(messId: string): Promise<TimetableBreakEntity[]> {
    const docs = await TimetableBreakModel.find({ messId: messId.trim() }).sort({
      dayOfWeek: 1,
      startsAt: 1,
    });
    return docs.map(toEntity);
  }
}
