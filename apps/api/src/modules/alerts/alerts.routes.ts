/**
 * modules/alerts/alerts.routes.ts — Express routes for staff alerts and tray controller.
 * DOC3 §3.6, DOC4 Step 13.
 *
 * Endpoints:
 * - GET /staff/alerts
 * - POST /staff/alerts/:id/ack
 * - PUT /staff/meals/:mealId/trays
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { Role } from '@messpulse/shared';
import type { AlertService } from './alerts.service';
import { AuthError, ValidationError } from '../../shared-kernel/errors';

const UpdateTraysBodySchema = z.object({
  capacityPortions: z.number().int().min(1).max(10000),
});

export function createAlertsRoutes(
  alertsService: AlertService,
  authMiddleware: {
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
  }
): Router {
  const router = Router();
  const { requireAuth, requireRole } = authMiddleware;

  // Protect all staff alert routes for staff and admin
  router.use(requireAuth);
  router.use(requireRole('staff', 'admin'));

  // GET /staff/alerts?open=true
  router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const openOnly = req.query.open === 'true';
      const messId = typeof req.query.messId === 'string' ? req.query.messId : undefined;
      const alerts = await alertsService.listAlerts(messId, openOnly);
      res.status(200).json(alerts);
    } catch (err) {
      next(err);
    }
  });

  // POST /staff/alerts/:id/ack
  router.post('/alerts/:id/ack', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.principal) {
        throw new AuthError('Authentication required');
      }

      const alertId = req.params.id;
      if (!alertId) {
        throw new ValidationError('Alert ID is required');
      }

      const acked = await alertsService.ackAlert(alertId, req.principal.userId);
      res.status(200).json(acked);
    } catch (err) {
      next(err);
    }
  });

  // PUT /staff/meals/:mealId/trays
  router.put('/meals/:mealId/trays', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mealId = req.params.mealId;
      if (!mealId) {
        throw new ValidationError('Meal ID is required');
      }

      const parsed = UpdateTraysBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid tray capacity request',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message }))
        );
      }

      const messId = typeof req.query.messId === 'string' ? req.query.messId : undefined;
      const result = await alertsService.updateTrayCapacity(mealId, parsed.data.capacityPortions, messId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
