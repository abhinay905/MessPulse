/**
 * modules/admin/admin.routes.test.ts — Route integration and role matrix tests for Admin module.
 * DOC3 §3.7, DOC4 Step 14.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createAdminRoutes } from './admin.routes';
import { TokenService } from '../auth/token.service';
import { createAuthMiddleware } from '../auth/auth.middleware';
import type { AdminService } from './admin.service';
import { SettingsDTOSchema, type SettingsDTO, type TimeSeriesPoint, type DecayCurveResponse, type CheckinTokenResponse } from '@messpulse/shared';
import { AppError } from '../../shared-kernel/errors';

describe('Admin Routes & Role Matrix', () => {
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';
  const tokenService = new TokenService(jwtSecret);
  const authMiddleware = createAuthMiddleware(tokenService, 'test-ingest-key');

  const studentToken = tokenService.sign({ id: 'student-1', role: 'student' });
  const staffToken = tokenService.sign({ id: 'staff-1', role: 'staff' });
  const adminToken = tokenService.sign({ id: 'admin-1', role: 'admin' });

  let mockAdminService: Partial<AdminService>;
  let app: express.Application;

  const mockSettings: SettingsDTO = SettingsDTOSchema.parse({
    messId: 'mess-main-hall',
    capacity: 200,
    servicePerMin: 12,
    demandFactor: 0,
    baseMealMin: 18,
    maxSessionMin: 60,
    staleCameraSec: 30,
    alertCooldownSec: 180,
    updatedAt: 1700000000000,
  });

  const mockSeries: TimeSeriesPoint[] = [
    { ts: 1700000000000, camera: 50, sessionEstimate: 45, decayWeighted: 40, waitMin: 2 },
  ];

  const mockDecayCurve: DecayCurveResponse = {
    theoretical: [{ offsetMin: 0, weight: 1 }],
    liveHistogram: [{ bin: '0.8 - 1.0', count: 5 }],
    activeSessions: 5,
  };

  const mockCheckinToken: CheckinTokenResponse = {
    token: 'mock-jwt-token',
    url: 'http://localhost:3000/student?token=mock-jwt-token',
    expiresAt: 1700003600000,
  };

  beforeEach(() => {
    mockAdminService = {
      getTimeSeries: async () => mockSeries,
      getDecayCurve: async () => mockDecayCurve,
      getSettings: async () => mockSettings,
      updateSettings: async (_messId, patch) => {
        const p = patch as Partial<SettingsDTO>;
        return {
          ...mockSettings,
          ...p,
          updatedAt: Date.now(),
        };
      },
      getCheckinToken: async () => mockCheckinToken,
    };

    app = express();
    app.use(express.json());
    app.use(
      '/admin',
      createAdminRoutes(mockAdminService as AdminService, authMiddleware)
    );

    // Global error handler
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      if (err instanceof AppError) {
        res.status(err.httpStatus).json({ error: { code: err.code, message: err.message, details: err.details } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected' } });
    });
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/admin/mess/mess-main-hall/settings');
      expect(res.status).toBe(401);
    });

    it('rejects student tokens on all admin endpoints with 403', async () => {
      const resSettings = await request(app)
        .get('/admin/mess/mess-main-hall/settings')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(resSettings.status).toBe(403);

      const resTimeseries = await request(app)
        .get('/admin/mess/mess-main-hall/timeseries?from=100&to=200')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(resTimeseries.status).toBe(403);

      const resPatch = await request(app)
        .patch('/admin/mess/mess-main-hall/settings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ capacity: 250 });
      expect(resPatch.status).toBe(403);
    });

    it('allows staff to GET settings with 200, but rejects PATCH with 403', async () => {
      const getRes = await request(app)
        .get('/admin/mess/mess-main-hall/settings')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.capacity).toBe(200);

      // Staff cannot PATCH settings (DOC4 Step 14 requirement)
      const patchRes = await request(app)
        .patch('/admin/mess/mess-main-hall/settings')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ capacity: 300 });
      expect(patchRes.status).toBe(403);
    });

    it('rejects staff token on timeseries, decay-curve, and checkin-token with 403', async () => {
      const resTs = await request(app)
        .get('/admin/mess/mess-main-hall/timeseries?from=100&to=200')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resTs.status).toBe(403);

      const resCurve = await request(app)
        .get('/admin/mess/mess-main-hall/decay-curve')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resCurve.status).toBe(403);

      const resQr = await request(app)
        .get('/admin/meals/20261017-lunch/checkin-token')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(resQr.status).toBe(403);
    });
  });

  describe('Admin actions', () => {
    it('admin gets timeseries with 200', async () => {
      const res = await request(app)
        .get('/admin/mess/mess-main-hall/timeseries?from=1700000000000&to=1700003600000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockSeries);
    });

    it('admin gets decay-curve with 200', async () => {
      const res = await request(app)
        .get('/admin/mess/mess-main-hall/decay-curve')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockDecayCurve);
    });

    it('admin updates settings with 200', async () => {
      const res = await request(app)
        .patch('/admin/mess/mess-main-hall/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capacity: 350 });
      expect(res.status).toBe(200);
      expect(res.body.capacity).toBe(350);
    });

    it('admin gets checkin-token with 200', async () => {
      const res = await request(app)
        .get('/admin/meals/20261017-lunch/checkin-token')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('mock-jwt-token');
      expect(res.body.url).toContain('/student?token=');
    });
  });
});
