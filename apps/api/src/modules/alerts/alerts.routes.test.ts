/**
 * modules/alerts/alerts.routes.test.ts — Route integration tests for staff alerts API.
 * DOC3 §3.6.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createAlertsRoutes } from './alerts.routes';
import { TokenService } from '../auth/token.service';
import { createAuthMiddleware } from '../auth/auth.middleware';
import type { AlertService } from './alerts.service';
import type { AlertDTO } from '@messpulse/shared';

describe('Staff Alerts Routes', () => {
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';
  const tokenService = new TokenService(jwtSecret);
  const authMiddleware = createAuthMiddleware(tokenService, 'test-ingest-key');

  const staffToken = tokenService.sign({ id: 'staff-1', role: 'staff' });
  const adminToken = tokenService.sign({ id: 'admin-1', role: 'admin' });
  const studentToken = tokenService.sign({ id: 'student-1', role: 'student' });

  const mockAlert: AlertDTO = {
    id: 'alert-1',
    ruleId: 'tray-depletion',
    mealId: 'meal-lunch-1',
    severity: 'warning',
    message: 'Trays running low',
    raisedAt: Date.now() - 30000,
  };

  let mockAlertsService: Partial<AlertService>;
  let app: express.Application;

  beforeEach(() => {
    mockAlertsService = {
      listAlerts: async (_messId, openOnly) => (openOnly ? [mockAlert] : [mockAlert]),
      ackAlert: async (id, _ackedBy) => {
        void _ackedBy;
        return {
          ...mockAlert,
          id,
          ackedAt: Date.now(),
        };
      },
      updateTrayCapacity: async (mealId, capacityPortions) => ({
        mealId,
        capacityPortions,
      }),
    };

    app = express();
    app.use(express.json());
    app.use(
      '/staff',
      createAlertsRoutes(mockAlertsService as AlertService, authMiddleware)
    );
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      const e = err as { httpStatus?: number; message?: string; code?: string };
      const status = typeof e.httpStatus === 'number' ? e.httpStatus : 500;
      res.status(status).json({ error: { message: e.message, code: e.code } });
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/staff/alerts');
    expect(res.status).toBe(401);
  });

  it('rejects student role with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/staff/alerts')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('allows staff to list alerts via GET /staff/alerts', async () => {
    const res = await request(app)
      .get('/staff/alerts?open=true')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('alert-1');
  });

  it('allows admin to list alerts via GET /staff/alerts', async () => {
    const res = await request(app)
      .get('/staff/alerts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('allows staff to acknowledge alert via POST /staff/alerts/:id/ack', async () => {
    const res = await request(app)
      .post('/staff/alerts/alert-1/ack')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('alert-1');
    expect(res.body.ackedAt).toBeDefined();
  });

  it('allows staff to update tray capacity via PUT /staff/meals/:mealId/trays', async () => {
    const res = await request(app)
      .put('/staff/meals/meal-lunch-1/trays')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ capacityPortions: 350 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mealId: 'meal-lunch-1', capacityPortions: 350 });
  });

  it('rejects invalid tray capacity with 422', async () => {
    const res = await request(app)
      .put('/staff/meals/meal-lunch-1/trays')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ capacityPortions: -10 });
    expect(res.status).toBe(422);
  });
});
