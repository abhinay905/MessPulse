/**
 * modules/ingest/ingest.routes.ts — Express routes for vision stream ingestion.
 * DOC3 §3.2, DOC2 §2.4, DOC4 Step 7.
 */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { LiveCountPayloadSchema } from '@messpulse/shared';
import { ValidationError } from '../../shared-kernel/errors';
import type { IngestService } from './ingest.service';
import type { Clock } from '../../core/ports';

export function createIngestRoutes(
  ingestService: IngestService,
  clock: Clock,
  requireIngestKey: RequestHandler
): Router {
  const router = Router();

  /**
   * POST /api/v1/mess/live-count
   * Receives camera live count readings from vision reporter.
   */
  router.post(
    '/live-count',
    requireIngestKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = LiveCountPayloadSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid ingest payload',
            parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              issue: i.message,
            }))
          );
        }

        const result = await ingestService.recordReading(parsed.data, clock.now());

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
