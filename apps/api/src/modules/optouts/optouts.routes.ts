/**
 * modules/optouts/optouts.routes.ts — Express routes for Advance Opt-Out ("Skipping Today").
 * DOC2 §2.7.5, DOC3 §3.13, DOC4 Step 17.
 *
 * POST /optouts       -> Advance opt-out (201 OptOutResponse)
 * DELETE /optouts     -> Cancel opt-out (204)
 * GET /optouts/me     -> Status for meal (200 OptOutResponse)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { OptOutRequestSchema, type Role } from '@messpulse/shared';
import type { OptOutService } from './optouts.service';
import { AuthError, ValidationError } from '../../shared-kernel/errors';

export function createOptOutRoutes(
  optOutService: OptOutService,
  authMiddleware: {
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
  }
): Router {
  const router = Router();
  const { requireAuth, requireRole } = authMiddleware;

  // Student advance opt-out
  router.post(
    '/',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const parsed = OptOutRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid opt-out request',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message }))
          );
        }

        const result = await optOutService.set(req.principal.userId, parsed.data.mealId);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Student cancel opt-out
  router.delete(
    '/',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const mealId = (req.body?.mealId || req.query?.mealId) as string | undefined;
        if (!mealId || typeof mealId !== 'string' || mealId.trim().length === 0) {
          throw new ValidationError('mealId is required to cancel opt-out');
        }

        await optOutService.remove(req.principal.userId, mealId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // Student get own opt-out status for a meal
  router.get(
    '/me',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const mealId = req.query.mealId as string | undefined;
        if (!mealId || typeof mealId !== 'string' || mealId.trim().length === 0) {
          throw new ValidationError('mealId query parameter is required');
        }

        const result = await optOutService.getMine(req.principal.userId, mealId);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
