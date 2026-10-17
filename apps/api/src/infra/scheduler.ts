/**
 * infra/scheduler.ts — periodic background jobs for MessPulse API.
 * DOC3 §3.3, §3.5, DOC4 Step 8.
 * Started ONLY in server.ts; never auto-started in tests or buildApp().
 */

import { logger } from './logger';
import type { OccupancyService } from '../modules/occupancy/occupancy.service';
import type { Clock } from '../core/ports';

export interface ReaperJob {
  reap(now: number): Promise<number>;
}

export interface AlertTickJob {
  handleTick(now?: number): Promise<void>;
}

export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(
    private readonly occupancyService: OccupancyService,
    private readonly sessionReaper: ReaperJob,
    private readonly clock: Clock,
    private readonly alertTickJob?: AlertTickJob | undefined
  ) {}

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // 1-second Occupancy & Alerts tick
    const tickTimer = setInterval(async () => {
      const now = this.clock.now();
      try {
        await this.occupancyService.tick(now);
      } catch (err) {
        logger.error({ err }, 'Scheduler job failed [occupancy.tick]');
      }

      if (this.alertTickJob) {
        try {
          await this.alertTickJob.handleTick(now);
        } catch (err) {
          logger.error({ err }, 'Scheduler job failed [alerts.tick]');
        }
      }
    }, 1000);
    this.timers.push(tickTimer);

    // 5-second Sessions reaper
    const reaperTimer = setInterval(async () => {
      try {
        await this.sessionReaper.reap(this.clock.now());
      } catch (err) {
        logger.error({ err }, 'Scheduler job failed [sessions.reaper]');
      }
    }, 5000);
    this.timers.push(reaperTimer);

    logger.info('Scheduler started: [occupancy.tick (1s), sessions.reaper (5s)]');
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
