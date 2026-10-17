/**
 * infra/redis/otp-store.redis.ts — Redis implementation of OtpStore.
 * DOC2 §2.3.
 */

import type { Redis } from 'ioredis';
import type { OtpStore } from '../../core/ports';

export class RedisOtpStore implements OtpStore {
  constructor(private readonly redis: Redis) {}

  private key(email: string): string {
    const normalized = email.toLowerCase().trim();
    return `mp:otp:${normalized}`;
  }

  async set(email: string, hashedOtp: string, ttlSec: number): Promise<void> {
    const key = this.key(email);
    const multi = this.redis.multi();
    multi.hset(key, 'codeHash', hashedOtp, 'attempts', '0');
    multi.expire(key, ttlSec);
    await multi.exec();
  }

  async get(email: string): Promise<string | null> {
    const key = this.key(email);
    return await this.redis.hget(key, 'codeHash');
  }

  async delete(email: string): Promise<void> {
    const key = this.key(email);
    await this.redis.del(key);
  }

  async incrementAttempts(email: string): Promise<number> {
    const key = this.key(email);
    return await this.redis.hincrby(key, 'attempts', 1);
  }
}
