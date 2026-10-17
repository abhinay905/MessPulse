/**
 * modules/sessions/sessions.routes.ts — Express routes for session check-in and lifecycle.
 * DOC2 §2.4, DOC3 §3.4.
 *
 * POST /sessions -> check-in (201 SessionDTO)
 * GET /sessions/me/active -> current active session (200 SessionDTO | 200 null)
 * DELETE /sessions/me/active -> "I'm done" early exit (204)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { CheckInRequestSchema, type Role } from '@messpulse/shared';
import type { SessionService } from './sessions.service';
import { AuthError, ValidationError } from '../../shared-kernel/errors';

export function createSessionsRoutes(
  sessionsService: SessionService,
  authMiddleware: {
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
  }
): Router {
  const router = Router();
  const { requireAuth, requireRole } = authMiddleware;

  // Student check-in via meal token and optional geolocation
  router.post(
    '/',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const parsed = CheckInRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid check-in request',
            parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message }))
          );
        }

        const session = await sessionsService.checkIn(req.principal.userId, parsed.data);
        res.status(201).json(session);
      } catch (err) {
        next(err);
      }
    }
  );

  // Active session for current user
  router.get(
    '/me/active',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const messId = typeof req.query.messId === 'string' ? req.query.messId : undefined;
        const session = await sessionsService.getActiveSession(req.principal.userId, messId);
        res.status(200).json(session);
      } catch (err) {
        next(err);
      }
    }
  );

  // "I'm done" early session exit
  router.delete(
    '/me/active',
    requireAuth,
    requireRole('student'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }

        const messId = typeof req.query.messId === 'string' ? req.query.messId : undefined;
        await sessionsService.endEarly(req.principal.userId, messId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
