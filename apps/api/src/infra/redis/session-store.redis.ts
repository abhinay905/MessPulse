/**
 * infra/redis/session-store.redis.ts — Redis implementation of SessionStore.
 * DOC2 §2.3, DOC3 §3.4.
 *
 * All keys prefixed with 'mp:' and private to this file.
 * Timing is encoded in the ZSET member so occupancy reads need zero per-session lookups.
 * 'start' uses atomic SET NX; 'removeExpired' uses a single MULTI.
 */

import type { Redis } from 'ioredis';
import type { ActiveSession, SessionStore } from '../../core/ports';

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  private userKey(userId: string, mealId: string): string {
    return `mp:user:${userId}:meal:${mealId}`;
  }

  private sessionKey(sessionId: string): string {
    return `mp:session:${sessionId}`;
  }

  private zsetKey(mealId: string): string {
    return `mp:meal:${mealId}:sessions`;
  }

  async start(session: ActiveSession): Promise<'created' | 'already_active'> {
    const userKey = this.userKey(session.userId, session.mealId);
    const sessionKey = this.sessionKey(session.sessionId);
    const zsetKey = this.zsetKey(session.mealId);

    // TTL in seconds: hard expiry offset + 60s safety buffer
    const ttlSec = Math.max(
      60,
      Math.ceil((session.hardExpiresAt - session.checkedInAt) / 1000) + 60
    );

    // 1. Atomic SET NX on user-meal key
    const acquired = await this.redis.set(userKey, session.sessionId, 'EX', ttlSec, 'NX');
    if (!acquired) {
      return 'already_active';
    }

    const sessionCopy: ActiveSession = { ...session };
    const member = JSON.stringify(sessionCopy);

    // 2. Add session lookup key and sorted set entry in atomic batch
    const multi = this.redis.multi();
    multi.set(sessionKey, member, 'EX', ttlSec);
    multi.zadd(zsetKey, session.hardExpiresAt, member);
    await multi.exec();

    return 'created';
  }

  async getActiveForUser(userId: string, mealId: string): Promise<ActiveSession | null> {
    const sessionId = await this.redis.get(this.userKey(userId, mealId));
    if (!sessionId) {
      return null;
    }

    const sessionJson = await this.redis.get(this.sessionKey(sessionId));
    if (!sessionJson) {
      return null;
    }

    return JSON.parse(sessionJson) as ActiveSession;
  }

  async end(userId: string, mealId: string): Promise<ActiveSession | null> {
    const userKey = this.userKey(userId, mealId);
    const sessionId = await this.redis.get(userKey);
    if (!sessionId) {
      return null;
    }

    const sessionKey = this.sessionKey(sessionId);
    const sessionJson = await this.redis.get(sessionKey);
    if (!sessionJson) {
      await this.redis.del(userKey);
      return null;
    }

    const session = JSON.parse(sessionJson) as ActiveSession;
    const zsetKey = this.zsetKey(mealId);

    const multi = this.redis.multi();
    multi.del(userKey);
    multi.del(sessionKey);
    multi.zrem(zsetKey, sessionJson);
    await multi.exec();

    return session;
  }

  async listActive(mealId: string, now: number): Promise<ActiveSession[]> {
    const zsetKey = this.zsetKey(mealId);
    // ZRANGEBYSCORE with '(' exclusive bound to get strictly > now
    const members = await this.redis.zrangebyscore(zsetKey, `(${now}`, '+inf');
    return members.map((m) => JSON.parse(m) as ActiveSession);
  }

  async removeExpired(mealId: string, now: number): Promise<ActiveSession[]> {
    const zsetKey = this.zsetKey(mealId);

    // Find all sessions with score <= now
    const expiredMembers = await this.redis.zrangebyscore(zsetKey, '-inf', now);
    if (expiredMembers.length === 0) {
      return [];
    }

    const expiredSessions = expiredMembers.map((m) => JSON.parse(m) as ActiveSession);

    // Single MULTI: remove from ZSET and delete corresponding user and session keys
    const multi = this.redis.multi();
    multi.zremrangebyscore(zsetKey, '-inf', now);
    for (const session of expiredSessions) {
      multi.del(this.userKey(session.userId, mealId));
      multi.del(this.sessionKey(session.sessionId));
    }
    await multi.exec();

    return expiredSessions;
  }
}
