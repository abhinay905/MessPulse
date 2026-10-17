/**
 * modules/sessions/sessions.routes.test.ts — HTTP integration tests for Sessions endpoints.
 * DOC2 §2.4, DOC3 §3.4, DOC4 Step 9.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app';
import { buildContainer } from '../../container';
import { InMemorySessionStore } from '../../infra/memory/session-store.memory';
import { TokenService } from '../auth/token.service';
import { signMealToken } from './meal-token';
import type {
  CheckInEntity,
  CheckInRepository,
  MealEntity,
  MealRepository,
  MessSettingsEntity,
  SettingsRepository,
} from '../../core/ports';

class TestMealRepo implements MealRepository {
  public meals = new Map<string, MealEntity>();

  async findByMealId(messId: string, mealId: string): Promise<MealEntity | null> {
    return this.meals.get(`${messId}:${mealId}`) ?? null;
  }

  async findActiveAt(messId: string, now: number): Promise<MealEntity | null> {
    for (const meal of this.meals.values()) {
      if (meal.messId === messId && now >= meal.startsAt && now <= meal.endsAt) {
        return meal;
      }
    }
    return null;
  }

  async findActiveOrUpcoming(messId: string, now: number, bufferMs = 0): Promise<MealEntity | null> {
    for (const meal of this.meals.values()) {
      if (meal.messId === messId && now >= meal.startsAt && now <= meal.endsAt + bufferMs) {
        return meal;
      }
    }
    return null;
  }

  async upsert(meal: Omit<MealEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MealEntity> {
    const entity: MealEntity = {
      ...meal,
      id: `meal-${this.meals.size + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.meals.set(`${meal.messId}:${meal.mealId}`, entity);
    return entity;
  }

  async updateTrayCapacity(messId: string, mealId: string, trayCapacity: number): Promise<MealEntity | null> {
    const key = `${messId}:${mealId}`;
    const meal = this.meals.get(key);
    if (!meal) return null;
    meal.trayCapacity = trayCapacity;
    return meal;
  }
}

class TestSettingsRepo implements SettingsRepository {
  public settings = new Map<string, MessSettingsEntity>();

  async getByMessId(messId: string): Promise<MessSettingsEntity | null> {
    return this.settings.get(messId) ?? null;
  }

  async upsert(s: Omit<MessSettingsEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessSettingsEntity> {
    const entity: MessSettingsEntity = {
      ...s,
      id: `set-${this.settings.size + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.settings.set(s.messId, entity);
    return entity;
  }
}

class TestCheckInRepo implements CheckInRepository {
  public archives: CheckInEntity[] = [];

  async archive(checkIn: Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.archives.push({
      ...checkIn,
      id: `arch-${this.archives.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async archiveMany(checkIns: Array<Omit<CheckInEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    for (const c of checkIns) {
      await this.archive(c);
    }
  }

  async findBySessionId(sessionId: string): Promise<CheckInEntity | null> {
    return this.archives.find((a) => a.sessionId === sessionId) ?? null;
  }

  async listForMeal(mealId: string): Promise<CheckInEntity[]> {
    return this.archives.filter((a) => a.mealId === mealId);
  }
}

import { config } from '../../config';

describe('Sessions Routes HTTP Integration', () => {
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';
  const messId = config.DEFAULT_MESS_ID;
  const mealId = '20261017-lunch';

  let app: ReturnType<typeof buildApp>;
  let tokenService: TokenService;
  let mealRepo: TestMealRepo;
  let settingsRepo: TestSettingsRepo;
  let checkInRepo: TestCheckInRepo;

  let studentJwt: string;
  let staffJwt: string;

  beforeEach(async () => {
    tokenService = new TokenService(jwtSecret);
    const sessionStore = new InMemorySessionStore();
    checkInRepo = new TestCheckInRepo();
    mealRepo = new TestMealRepo();
    settingsRepo = new TestSettingsRepo();

    const now = Date.now();
    await settingsRepo.upsert({
      messId,
      name: 'Main Dining Hall',
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
    });

    await mealRepo.upsert({
      messId,
      mealId,
      type: 'lunch',
      startsAt: now - 30 * 60 * 1000, // started 30 min ago
      endsAt: now + 2 * 3600 * 1000,  // ends in 2 hours
      menuItems: ['Rice', 'Dal'],
      menuDemandFactorMin: 0,
      trayCapacity: 300,
    });

    const container = buildContainer({
      sessionStore,
      checkInRepo,
      mealRepo,
      settingsRepo,
      tokenService,
    });

    app = buildApp(container);

    studentJwt = tokenService.sign({
      id: 'student-user-123',
      role: 'student',
    });

    staffJwt = tokenService.sign({
      id: 'staff-user-456',
      role: 'staff',
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/v1/sessions').send({ mealToken: 'dummy' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_ERROR');
  });

  it('rejects non-student roles with 403', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${staffJwt}`)
      .send({ mealToken: 'dummy' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('creates a session with a valid meal token -> 201 SessionDTO', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({
        mealToken,
        geo: { lat: 12.9716, lng: 77.5946, accuracy: 10 },
      });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.mealId).toBe(mealId);
    expect(res.body.geofence).toBe('inside');
    expect(res.body.checkedInAt).toBeTypeOf('number');
    expect(res.body.expectedStayEndsAt).toBeTypeOf('number');
    expect(res.body.hardExpiresAt).toBeTypeOf('number');
  });

  it('returns 409 ALREADY_CHECKED_IN on duplicate check-in', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    // First check-in -> 201
    await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ mealToken });

    // Second check-in -> 409 ALREADY_CHECKED_IN
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ mealToken });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  it('returns 422 MEAL_TOKEN_INVALID on invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ mealToken: 'garbage-token' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MEAL_TOKEN_INVALID');
  });

  it('handles GET and DELETE /sessions/me/active lifecycle idempotently', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    // Initial check: no active session -> 200 null
    const getInit = await request(app)
      .get('/api/v1/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(getInit.status).toBe(200);
    expect(getInit.body).toBeNull();

    // Check-in
    await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ mealToken });

    // Active session found
    const getActive = await request(app)
      .get('/api/v1/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(getActive.status).toBe(200);
    expect(getActive.body.mealId).toBe(mealId);

    // End early -> 204
    const delRes = await request(app)
      .delete('/api/v1/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(delRes.status).toBe(204);

    // Now active session is null
    const getAfter = await request(app)
      .get('/api/v1/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(getAfter.status).toBe(200);
    expect(getAfter.body).toBeNull();

    // Repeated delete is idempotent -> 204
    const delAgain = await request(app)
      .delete('/api/v1/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(delAgain.status).toBe(204);
  });

  it('allows accessing endpoints via alias /sessions', async () => {
    const mealToken = signMealToken({ messId, mealId }, jwtSecret, 3600);

    const res = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ mealToken });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();

    const getRes = await request(app)
      .get('/sessions/me/active')
      .set('Authorization', `Bearer ${studentJwt}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.sessionId).toBe(res.body.sessionId);
  });
});
