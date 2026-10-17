/**
 * infra/mongo/connection.ts — Mongoose connection management.
 */

import mongoose from 'mongoose';

export async function connectMongo(mongoUrl?: string): Promise<typeof mongoose> {
  const url = mongoUrl || process.env.MONGO_URL || 'mongodb://localhost:27017/messpulse';
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  return await mongoose.connect(url);
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
