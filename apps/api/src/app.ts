/**
 * app.ts — Express app factory.
 * Builds the app from the container without calling listen().
 * Exposes /healthz and /readyz stubs for Docker/Railway health checks.
 * DOC3 §3.1 — request-id, JSON parser, error middleware, no domain logic here.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AppError } from './shared-kernel/errors';
import { logger } from './infra/logger';
import { buildContainer, type Container } from './container';
import { createAuthRoutes } from './modules/auth/auth.routes';

export function buildApp(
  container: Container = buildContainer(),
  configureExtraRoutes?: (app: express.Application) => void
): express.Application {
  const app = express();

  // ─── Request-id ─────────────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('x-request-id', id);
    next();
  });

  // ─── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));

  // ─── Health checks ───────────────────────────────────────────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // /readyz will be enhanced in Step 8 with real Redis/Mongo checks
  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', checks: { api: 'ok' } });
  });

  // ─── Feature Routes ──────────────────────────────────────────────────────────
  app.use('/api/v1/auth', createAuthRoutes(container.authService, container.authMiddleware));

  if (configureExtraRoutes) {
    configureExtraRoutes(app);
  }

  // ─── Error middleware (must be last) ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string | undefined;

    if (err instanceof AppError) {
      if (err.httpStatus >= 500) {
        logger.error({ err, requestId }, err.message);
      } else {
        logger.warn({ code: err.code, requestId }, err.message);
      }
      res.status(err.httpStatus).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? undefined,
          requestId,
        },
      });
      return;
    }

    // Unknown error — log with stack, return generic message
    logger.error({ err, requestId }, 'Unexpected error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
  });

  return app;
}
