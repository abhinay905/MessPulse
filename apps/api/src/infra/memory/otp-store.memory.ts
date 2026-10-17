/**
 * infra/memory/otp-store.memory.ts — in-memory implementation of OtpStore.
 */

import type { OtpStore } from '../../core/ports';

interface OtpRecord {
  hashedOtp: string;
  expiresAt: number;
  attempts: number;
}

export class InMemoryOtpStore implements OtpStore {
  private readonly records = new Map<string, OtpRecord>();

  async set(email: string, hashedOtp: string, ttlSec: number): Promise<void> {
    const key = email.toLowerCase().trim();
    this.records.set(key, {
      hashedOtp,
      expiresAt: Date.now() + ttlSec * 1000,
      attempts: 0,
    });
  }

  async get(email: string): Promise<string | null> {
    const key = email.toLowerCase().trim();
    const record = this.records.get(key);
    if (!record) {
      return null;
    }
    if (Date.now() > record.expiresAt) {
      this.records.delete(key);
      return null;
    }
    return record.hashedOtp;
  }

  async delete(email: string): Promise<void> {
    const key = email.toLowerCase().trim();
    this.records.delete(key);
  }

  async incrementAttempts(email: string): Promise<number> {
    const key = email.toLowerCase().trim();
    const record = this.records.get(key);
    if (!record) {
      return 0;
    }
    record.attempts += 1;
    return record.attempts;
  }
}
