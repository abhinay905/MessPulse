/**
 * modules/simulator/simulator.routes.ts — admin endpoints for the demo simulator.
 * DOC2 §2.4, DOC3 §3.9.
 *
 * POST /admin/simulator/start -> 202 { runId, status: 'started' }
 * POST /admin/simulator/stop  -> 200 { status: 'stopped' }
 * GET  /admin/simulator/status -> 200 SimulatorStatus
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { SimulatorStartSchema, type Role } from '@messpulse/shared';
import type { SimulatorService } from './simulator.service';
import { ValidationError } from '../../shared-kernel/errors';

export function createSimulatorRoutes(
  simulatorService: SimulatorService,
  authMiddleware: {
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
  }
): Router {
  const router = Router();
  const { requireAuth, requireRole } = authMiddleware;

  // Start simulation
  router.post(
    '/start',
    requireAuth,
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = SimulatorStartSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid simulator parameters',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message }))
          );
        }

        const result = await simulatorService.start(parsed.data);
        res.status(202).json({
          runId: result.runId,
          status: 'started',
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Stop simulation
  router.post(
    '/stop',
    requireAuth,
    requireRole('admin'),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        await simulatorService.stop();
        res.status(200).json({ status: 'stopped' });
      } catch (err) {
        next(err);
      }
    }
  );

  // Current simulation status
  router.get(
    '/status',
    requireAuth,
    requireRole('admin'),
    (_req: Request, res: Response) => {
      const status = simulatorService.status();
      res.status(200).json(status);
    }
  );

  return router;
}
