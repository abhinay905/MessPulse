/**
 * modules/sessions/sessions.service.ts — session lifecycle management.
 * DOC3 §3.4: checkIn, startSession, getActiveSession, endEarly, reapExpired.
 *
 * Coordinates timing, geofence, Redis sorted sets, and Mongo check-in archives.
 * Sessions does not import occupancy; uses QueueWaitProvider port.
 * Never persists or logs raw latitude/longitude.
 */

import crypto from 'node:crypto';
import type { CheckInRequest, SessionDTO } from '@messpulse/shared';
import { computeSessionTiming } from '../../core/timing';
import { evaluateGeofence, type GeoPoint } from '../../core/geofence';
import { verifyMealToken } from './meal-token';
import type {
  ActiveSession,
  CheckInRepository,
  MealRepository,
  SessionStore,
  SettingsRepository,
  QueueWaitProvider,
} from './sessions.ports';
import type { Clock } from '../../core/ports';
import type { EventBus } from '../../infra/event-bus';
import { logger } from '../../infra/logger';
import { ConflictError } from '../../shared-kernel/errors';

const DEFAULT_FALLBACK_SETTINGS = {
  seatCapacity: 200,
  servicePerMin: 12,
  baseMealMin: 18,
  maxSessionMin: 60,
  decay: {
    tail: [
      { untilOffsetMin: 8, weight: 0.6 },
      { untilOffsetMin: 17, weight: 0.25 },
    ],
  },
  staleCameraSec: 30,
  alertThresholds: {},
  geofence: {
    lat: 12.9716,
    lng: 77.5946,
    radiusM: 100,
  },
};

export interface StartSessionParams {
  userId: string;
  mealId: string;
  messId: string;
  method: 'qr' | 'geofence' | 'sim';
  geofence?: 'inside' | 'outside' | 'unknown' | undefined;
}

export class SessionService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly checkInRepo: CheckInRepository,
    private readonly mealRepo: MealRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly queueWaitProvider: QueueWaitProvider,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
    private readonly jwtSecret: string,
    private readonly defaultMessId = 'mess-main-hall'
  ) {}

  /**
   * Orchestrates student check-in via QR token and optional geolocation.
   * DOC3 §3.4: verifyMealToken -> resolve meal/settings -> evaluateGeofence -> startSession.
   * Coordinates are evaluated to tri-state in-memory and discarded; never persisted or logged.
   */
  async checkIn(userId: string, input: CheckInRequest): Promise<SessionDTO> {
    const { messId, mealId } = verifyMealToken(input.mealToken, this.jwtSecret);
    const now = this.clock.now();

    const meal = await this.mealRepo.findByMealId(messId, mealId);
    if (!meal || now < meal.startsAt || now > meal.endsAt) {
      throw new ConflictError(
        'No meal is being served right now.',
        undefined,
        'NO_ACTIVE_MEAL'
      );
    }

    const settings =
      (await this.settingsRepo.getByMessId(messId)) ?? {
        ...DEFAULT_FALLBACK_SETTINGS,
        messId,
      };

    let geoPoint: GeoPoint | undefined;
    if (input.geo) {
      geoPoint = {
        lat: input.geo.lat,
        lng: input.geo.lng,
        accuracyM: input.geo.accuracyM ?? input.geo.accuracy ?? 0,
      };
    }
    const geofenceResult = evaluateGeofence(geoPoint, settings.geofence);

    return this.startSession({
      userId,
      mealId,
      messId,
      method: 'qr',
      geofence: geofenceResult,
    });
  }

  /**
   * Single place a dining session is created (used by checkIn and the simulator).
   * DOC3 §3.4.
   */
  async startSession(params: StartSessionParams): Promise<SessionDTO> {
    const now = this.clock.now();
    const meal = await this.mealRepo.findByMealId(params.messId, params.mealId);
    const settings =
      (await this.settingsRepo.getByMessId(params.messId)) ?? {
        ...DEFAULT_FALLBACK_SETTINGS,
        messId: params.messId,
      };

    const queueWaitSec = await this.queueWaitProvider.getEstimatedWaitSec(params.mealId);

    const timing = computeSessionTiming({
      baseMealMin: settings.baseMealMin,
      queueWaitSec,
      menuDemandFactorMin: meal?.menuDemandFactorMin ?? 0,
      decayTailMin: 17,
      maxSessionMin: settings.maxSessionMin,
    });

    const expectedStayEndsAt = now + timing.expectedStaySec * 1000;
    const hardExpiresAt = now + timing.hardExpirySec * 1000;

    const session: ActiveSession = {
      sessionId: crypto.randomUUID(),
      userId: params.userId,
      mealId: params.mealId,
      messId: params.messId,
      checkedInAt: now,
      expectedStayEndsAt,
      hardExpiresAt,
      geofence: params.geofence ?? 'unknown',
      method: params.method === 'geofence' ? 'geo' : params.method,
    };

    const result = await this.sessionStore.start(session);
    if (result === 'already_active') {
      throw new ConflictError(
        'Already checked in for this meal.',
        undefined,
        'ALREADY_CHECKED_IN'
      );
    }

    this.eventBus.publish('session.started', {
      messId: session.messId,
      mealId: session.mealId,
      sessionId: session.sessionId,
      userId: session.userId,
    });

    logger.info(
      {
        userId: session.userId,
        mealId: session.mealId,
        geofence: session.geofence,
        method: session.method,
      },
      'Session started'
    );

    return {
      sessionId: session.sessionId,
      mealId: session.mealId,
      checkedInAt: session.checkedInAt,
      expectedStayEndsAt: session.expectedStayEndsAt,
      hardExpiresAt: session.hardExpiresAt,
      geofence: session.geofence,
    };
  }

  /**
   * Retrieves the currently active session for a student user during an active meal.
   * Returns null if no active meal or no active session.
   */
  async getActiveSession(
    userId: string,
    messId = this.defaultMessId
  ): Promise<SessionDTO | null> {
    const now = this.clock.now();
    const meal = await this.mealRepo.findActiveAt(messId, now);
    if (!meal) {
      return null;
    }

    const session = await this.sessionStore.getActiveForUser(userId, meal.mealId);
    if (!session || session.hardExpiresAt <= now) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      mealId: session.mealId,
      checkedInAt: session.checkedInAt,
      expectedStayEndsAt: session.expectedStayEndsAt,
      hardExpiresAt: session.hardExpiresAt,
      geofence: session.geofence,
    };
  }

  /**
   * Ends an active session early ("I'm done" tap).
   * DOC3 §3.4: store.end -> archive with endReason:'manual' -> publish session.ended.
   * Idempotent (no-op if already ended or no active meal).
   */
  async endEarly(userId: string, messId = this.defaultMessId): Promise<void> {
    const now = this.clock.now();
    const meal = await this.mealRepo.findActiveAt(messId, now);
    if (!meal) {
      return;
    }

    const session = await this.sessionStore.end(userId, meal.mealId);
    if (!session) {
      return;
    }

    const queueWaitSecAtEntry = Math.max(
      0,
      Math.round((session.expectedStayEndsAt - session.checkedInAt) / 1000) - 18 * 60
    );

    await this.checkInRepo.archive({
      sessionId: session.sessionId,
      userId: session.userId,
      mealId: session.mealId,
      checkedInAt: session.checkedInAt,
      queueWaitSecAtEntry,
      expectedStaySec: Math.round((session.expectedStayEndsAt - session.checkedInAt) / 1000),
      hardExpirySec: Math.round((session.hardExpiresAt - session.checkedInAt) / 1000),
      method: (session.method === 'geo' ? 'geofence' : session.method) as 'qr' | 'geofence' | 'sim',
      geofence: session.geofence,
      endedAt: now,
      endReason: 'manual',
    });

    this.eventBus.publish('session.ended', {
      messId: session.messId,
      mealId: session.mealId,
      sessionId: session.sessionId,
      reason: 'manual',
    });

    logger.info(
      {
        userId: session.userId,
        mealId: session.mealId,
        sessionId: session.sessionId,
      },
      'Session ended early (manual)'
    );
  }

  /**
   * Removes hard-expired sessions for a meal and archives them in batch to Mongo.
   * DOC3 §3.4: store.removeExpired -> batch archiveMany -> publish session.ended.
   */
  async reapExpired(mealId: string, now = this.clock.now()): Promise<number> {
    const expired = await this.sessionStore.removeExpired(mealId, now);
    if (expired.length === 0) {
      return 0;
    }

    const records = expired.map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      mealId: s.mealId,
      checkedInAt: s.checkedInAt,
      queueWaitSecAtEntry: Math.max(
        0,
        Math.round((s.expectedStayEndsAt - s.checkedInAt) / 1000) - 18 * 60
      ),
      expectedStaySec: Math.round((s.expectedStayEndsAt - s.checkedInAt) / 1000),
      hardExpirySec: Math.round((s.hardExpiresAt - s.checkedInAt) / 1000),
      method: (s.method === 'geo' ? 'geofence' : s.method) as 'qr' | 'geofence' | 'sim',
      geofence: s.geofence,
      endedAt: s.hardExpiresAt,
      endReason: 'expired' as const,
    }));

    await this.checkInRepo.archiveMany(records);

    for (const session of expired) {
      this.eventBus.publish('session.ended', {
        messId: session.messId,
        mealId: session.mealId,
        sessionId: session.sessionId,
        reason: 'expired',
      });
    }

    logger.info({ mealId, count: expired.length }, 'Reaped expired sessions');
    return expired.length;
  }

  /**
   * Periodic scheduler task: finds active or recently ended meals and reaps expired sessions.
   * DOC3 §3.4: Safe to re-run every 5 seconds.
   */
  async reap(now = this.clock.now(), messId = this.defaultMessId): Promise<number> {
    const meal = await this.mealRepo.findActiveOrUpcoming(messId, now, 20 * 60 * 1000);
    if (!meal) {
      return 0;
    }
    return this.reapExpired(meal.mealId, now);
  }
}
