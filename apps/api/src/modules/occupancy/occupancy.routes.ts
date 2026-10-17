/**
 * modules/occupancy/occupancy.routes.ts — Express routes for status queries.
 * DOC3 §3.3, DOC2 §2.4, DOC4 Step 8.
 */

import { Router, type Request, type Response } from 'express';
import type { OccupancyService } from './occupancy.service';

export function createOccupancyRoutes(occupancyService: OccupancyService): Router {
  const router = Router();

  /**
   * GET /api/v1/mess/:messId/status
   * Returns current StatusSnapshot (cached; no recompute per request).
   */
  router.get('/:messId/status', (req: Request, res: Response) => {
    const messId = req.params['messId'] ?? 'mess-default';
    const snapshot = occupancyService.getLatest(messId);
    res.status(200).json(snapshot);
  });

  return router;
}
