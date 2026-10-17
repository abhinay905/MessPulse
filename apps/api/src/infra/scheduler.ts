/**
 * infra/scheduler.ts — periodic background jobs for MessPulse API.
 * DOC3 §3.3, §3.5, DOC4 Step 8.
 * Started ONLY in server.ts; never auto-started in tests or buildApp().
 */

import { logger } from './logger';
import type { OccupancyService } from '../modules/occupancy/occupancy.service';
import type { Clock } from '../core/ports';

export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(
    private readonly occupancyService: OccupancyService,
    private readonly clock: Clock
  ) {}

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // 1-second Occupancy tick
    const tickTimer = setInterval(async () => {
      try {
        await this.occupancyService.tick(this.clock.now());
      } catch (err) {
        logger.error({ err }, 'Scheduler job failed [occupancy.tick]');
      }
    }, 1000);
    this.timers.push(tickTimer);

    logger.info('Scheduler started: [occupancy.tick (1s)]');
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    logger.info('Scheduler stopped');
  }
}
