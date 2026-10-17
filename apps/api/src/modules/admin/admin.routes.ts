/**
 * modules/admin/admin.routes.ts — Express routes for Admin module.
 * DOC3 §3.7, DOC4 Step 14.
 *
 * Endpoints:
 * - GET /admin/mess/:id/timeseries
 * - GET /admin/mess/:id/decay-curve
 * - GET /admin/mess/:id/settings
 * - PATCH /admin/mess/:id/settings
 * - GET /admin/meals/:mealId/checkin-token
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Role } from '@messpulse/shared';
import type { AdminService } from './admin.service';
import { ValidationError } from '../../shared-kernel/errors';

export function createAdminRoutes(
  adminService: AdminService,
  authMiddleware: {
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
  }
): Router {
  const router = Router();
  const { requireAuth, requireRole } = authMiddleware;

  // All admin routes require authentication
  router.use(requireAuth);

  // GET /admin/mess/:id/timeseries (admin only)
  router.get(
    '/mess/:id/timeseries',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const messId = req.params.id;
        if (!messId) {
          throw new ValidationError('Mess ID is required');
        }

        const from = Number(req.query.from);
        const to = Number(req.query.to);
        const maxPoints = req.query.maxPoints ? Number(req.query.maxPoints) : 300;

        const series = await adminService.getTimeSeries(messId, from, to, maxPoints);
        res.status(200).json(series);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /admin/mess/:id/decay-curve (admin only)
  router.get(
    '/mess/:id/decay-curve',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const messId = req.params.id;
        if (!messId) {
          throw new ValidationError('Mess ID is required');
        }

        const curve = await adminService.getDecayCurve(messId);
        res.status(200).json(curve);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /admin/mess/:id/settings (staff or admin can view)
  router.get(
    '/mess/:id/settings',
    requireRole('staff', 'admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const messId = req.params.id;
        if (!messId) {
          throw new ValidationError('Mess ID is required');
        }

        const settings = await adminService.getSettings(messId);
        res.status(200).json(settings);
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /admin/mess/:id/settings (admin only)
  router.patch(
    '/mess/:id/settings',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const messId = req.params.id;
        if (!messId) {
          throw new ValidationError('Mess ID is required');
        }

        const headerIfMatch = req.headers['if-match-updated-at'];
        const expectedUpdatedAt =
          typeof headerIfMatch === 'string'
            ? Number(headerIfMatch)
            : typeof req.body.expectedUpdatedAt === 'number'
            ? req.body.expectedUpdatedAt
            : undefined;

        const updated = await adminService.updateSettings(
          messId,
          req.body,
          expectedUpdatedAt
        );
        res.status(200).json(updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /admin/meals/:mealId/checkin-token (admin only)
  router.get(
    '/meals/:mealId/checkin-token',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mealId = req.params.mealId;
        if (!mealId) {
          throw new ValidationError('Meal ID is required');
        }

        const baseUrl = `${req.protocol}://${req.get('host') ?? 'localhost:3000'}`;
        const tokenResp = await adminService.getCheckinToken(mealId, baseUrl);
        res.status(200).json(tokenResp);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
