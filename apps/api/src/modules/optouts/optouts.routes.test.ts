/**
 * modules/optouts/optouts.routes.test.ts — HTTP and role matrix tests for opt-outs.
 * DOC3 §3.13, DOC4 Step 17.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createOptOutRoutes } from './optouts.routes';
import { TokenService } from '../auth/token.service';
import { createAuthMiddleware } from '../auth/auth.middleware';
import type { OptOutService } from './optouts.service';
import { ValidationError, AppError } from '../../shared-kernel/errors';

describe('Opt-out Routes & Role Matrix', () => {
  const jwtSecret = 'test-jwt-secret-min-16-characters-long';
  const tokenService = new TokenService(jwtSecret);
  const authMiddleware = createAuthMiddleware(tokenService, 'test-ingest-key');

  const studentToken = tokenService.sign({ id: 'student-1', role: 'student' });
  const staffToken = tokenService.sign({ id: 'staff-1', role: 'staff' });
  const adminToken = tokenService.sign({ id: 'admin-1', role: 'admin' });

  let mockOptOutService: Partial<OptOutService>;
  let app: express.Application;

  beforeEach(() => {
    mockOptOutService = {
      set: async () => ({
        optedOut: true,
        cutoffAt: 1700000000000,
      }),
      remove: async () => {},
      getMine: async () => ({
        optedOut: false,
        cutoffAt: 1700000000000,
      }),
    };

    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/optouts',
      createOptOutRoutes(mockOptOutService as OptOutService, authMiddleware)
    );

    // Global error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    });
  });

  describe('Role Matrix Enforcement', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app).post('/api/v1/optouts').send({ mealId: 'm1' }).expect(401);
      await request(app).delete('/api/v1/optouts').send({ mealId: 'm1' }).expect(401);
      await request(app).get('/api/v1/optouts/me?mealId=m1').expect(401);
    });

    it('rejects staff tokens with 403 (student-only feature)', async () => {
      await request(app)
        .post('/api/v1/optouts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ mealId: 'm1' })
        .expect(403);

      await request(app)
        .get('/api/v1/optouts/me?mealId=m1')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('rejects admin tokens with 403', async () => {
      await request(app)
        .post('/api/v1/optouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mealId: 'm1' })
        .expect(403);
    });

    it('allows student tokens with 201 / 200 / 204', async () => {
      const postRes = await request(app)
        .post('/api/v1/optouts')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ mealId: 'm1' })
        .expect(201);
      expect(postRes.body.optedOut).toBe(true);

      const getRes = await request(app)
        .get('/api/v1/optouts/me?mealId=m1')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      expect(getRes.body.optedOut).toBe(false);

      await request(app)
        .delete('/api/v1/optouts')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ mealId: 'm1' })
        .expect(204);
    });
  });

  describe('Input validation & Window closed error', () => {
    it('returns 422 if mealId is missing', async () => {
      await request(app)
        .post('/api/v1/optouts')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({})
        .expect(422);

      await request(app)
        .get('/api/v1/optouts/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(422);
    });

    it('maps OPTOUT_WINDOW_CLOSED to 422 with code', async () => {
      mockOptOutService.set = async () => {
        throw new ValidationError('Opt-out window closed', undefined, 'OPTOUT_WINDOW_CLOSED');
      };

      const res = await request(app)
        .post('/api/v1/optouts')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ mealId: 'm1' })
        .expect(422);

      expect(res.body.code).toBe('OPTOUT_WINDOW_CLOSED');
    });
  });
});
