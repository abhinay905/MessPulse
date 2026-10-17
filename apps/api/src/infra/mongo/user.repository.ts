/**
 * infra/mongo/user.repository.ts — MongoDB repository for User.
 * Returns plain typed objects (never Mongoose documents).
 */

import type { UserEntity, UserRepository } from '../../core/ports';
import { UserModel, type IUserDocument } from './models/user.model';

function toEntity(doc: IUserDocument): UserEntity {
  return {
    id: doc._id.toString(),
    email: doc.email,
    rollNo: doc.rollNo,
    name: doc.name,
    role: doc.role,
    pinHash: doc.pinHash,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase().trim() });
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await UserModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async upsertStudent(email: string, name?: string): Promise<UserEntity> {
    const normalizedEmail = email.toLowerCase().trim();
    const defaultName = name || normalizedEmail.split('@')[0] || 'Student';

    const doc = await UserModel.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          email: normalizedEmail,
          name: defaultName,
          role: 'student',
        },
      },
      { upsert: true, new: true }
    );

    return toEntity(doc);
  }

  async createStaffOrAdmin(user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEntity> {
    const doc = await UserModel.findOneAndUpdate(
      { email: user.email.toLowerCase().trim() },
      {
        $set: {
          email: user.email.toLowerCase().trim(),
          name: user.name,
          role: user.role,
          rollNo: user.rollNo,
          pinHash: user.pinHash,
        },
      },
      { upsert: true, new: true }
    );

    return toEntity(doc);
  }
}
