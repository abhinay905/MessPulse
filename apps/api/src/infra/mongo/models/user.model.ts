/**
 * infra/mongo/models/user.model.ts — Mongoose User model.
 * DOC2 §2.3.
 */

import { Schema, model, type Document } from 'mongoose';

export interface IUserDocument extends Document {
  email: string;
  rollNo?: string | undefined;
  name: string;
  role: 'student' | 'staff' | 'admin';
  pinHash?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    rollNo: {
      type: String,
      required: false,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['student', 'staff', 'admin'],
      required: true,
    },
    pinHash: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const UserModel = model<IUserDocument>('User', userSchema);
