/**
 * modules/simulator/simulator.routes.test.ts — HTTP route integration tests for simulator endpoints.
 * DOC2 §2.4, DOC3 §3.9, DOC4 Step 10.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app';
import { buildContainer, type Container } from '../../container';
import { TokenService } from '../auth/token.service';
import type { MealEntity, MealRepository } from '../../core/ports';

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

describe('Simulator HTTP Routes', () => {
  let app: ReturnType<typeof buildApp>;
  let container: Container;
  let tokenService: TokenService;
  let mealRepo: TestMealRepo;
  let adminToken: string;
  let studentToken: string;

  beforeEach(() => {
    mealRepo = new TestMealRepo();
    container = buildContainer({
      mealRepo,
      allowSimulator: true,
    });
    app = buildApp(container);
    tokenService = new TokenService(process.env.JWT_SECRET || 'test-jwt-secret-at-least-16-chars');

    adminToken = tokenService.sign({
      id: 'admin-1',
      role: 'admin',
    });

    studentToken = tokenService.sign({
      id: 'student-1',
      role: 'student',
    });
  });

  afterEach(async () => {
    try {
      await container.simulatorService.stop();
    } catch {
      // ignore
    }
  });

  it('rejects unauthenticated requests to simulator endpoints with 401', async () => {
    const resStart = await request(app).post('/admin/simulator/start').send({});
    expect(resStart.status).toBe(401);

    const resStop = await request(app).post('/admin/simulator/stop').send({});
    expect(resStop.status).toBe(401);

    const resStatus = await request(app).get('/admin/simulator/status');
    expect(resStatus.status).toBe(401);
  });

  it('rejects non-admin roles (e.g. student) with 403', async () => {
    const resStart = await request(app)
      .post('/admin/simulator/start')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(resStart.status).toBe(403);
    expect(resStart.body.error.code).toBe('FORBIDDEN');

    const resStatus = await request(app)
      .get('/admin/simulator/status')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(resStatus.status).toBe(403);
  });

  it('returns 403 SIMULATOR_DISABLED when ALLOW_SIMULATOR is false', async () => {
    const disabledContainer = buildContainer({
      mealRepo,
      allowSimulator: false,
    });
    const appWithDisabledSim = buildApp(disabledContainer);

    const res = await request(appWithDisabledSim)
      .post('/admin/simulator/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIMULATOR_DISABLED');
  });

  it('returns 422 for invalid start parameters', async () => {
    const res = await request(app)
      .post('/admin/simulator/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ speed: -5 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('successfully starts, reports status, rejects duplicate, and stops', async () => {
    // 1. Initial status -> not running
    const resInitial = await request(app)
      .get('/admin/simulator/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resInitial.status).toBe(200);
    expect(resInitial.body.running).toBe(false);

    // 2. Start simulation
    const resStart = await request(app)
      .post('/admin/simulator/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ speed: 10, peakPeople: 100, durationMin: 18 });

    expect(resStart.status).toBe(202);
    expect(resStart.body.status).toBe('started');
    expect(typeof resStart.body.runId).toBe('string');
    expect(resStart.body.runId.length).toBeGreaterThan(0);

    // 3. Status while running
    const resStatus = await request(app)
      .get('/admin/simulator/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resStatus.status).toBe(200);
    expect(resStatus.body.running).toBe(true);
    expect(resStatus.body.runId).toBe(resStart.body.runId);

    // 4. Duplicate start -> 409 SIMULATOR_RUNNING
    const resDuplicate = await request(app)
      .post('/admin/simulator/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(resDuplicate.status).toBe(409);
    expect(resDuplicate.body.error.code).toBe('SIMULATOR_RUNNING');

    // 5. Stop simulation
    const resStop = await request(app)
      .post('/admin/simulator/stop')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resStop.status).toBe(200);
    expect(resStop.body.status).toBe('stopped');

    // 6. Status after stop
    const resFinal = await request(app)
      .get('/admin/simulator/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resFinal.status).toBe(200);
    expect(resFinal.body.running).toBe(false);
  });
});
