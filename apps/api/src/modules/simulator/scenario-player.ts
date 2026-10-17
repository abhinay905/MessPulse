/**
 * modules/simulator/scenario-player.ts — plays scenario events into IngestService and SessionService.
 * DOC3 §3.9.
 *
 * Simulated data enters through the EXACT SAME doors as real data:
 * - Camera counts via IngestService.recordReading()
 * - App check-ins via SessionService.startSession({ method: 'sim' })
 * No simulator-only code exists in IngestService, SessionService, OccupancyService, or UI.
 */

import type { ScenarioEvent } from '../../core/scenario';
import type { Clock } from '../../core/ports';
import type { IngestService } from '../ingest/ingest.service';
import type { SessionService } from '../sessions/sessions.service';
import type { AlertService } from '../alerts/alerts.service';
import { logger } from '../../infra/logger';

export interface ScenarioPlayerOptions {
  events: ScenarioEvent[];
  clock: Clock;
  ingestService: IngestService;
  sessionService: SessionService;
  alertsService?: AlertService | undefined;
  messId: string;
  mealId: string;
  speed: number;
  onComplete?: (() => void) | undefined;
  onError?: ((err: unknown) => void) | undefined;
}

export class ScenarioPlayer {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private eventIndex = 0;
  private startSimTime = 0;
  private seq = 1;
  private cumulativeIn = 0;
  private cumulativeOut = 0;
  private currentOccupancy = 0;
  private userIdCounter = 1;
  private lastReadingSimTime = 0;

  constructor(private readonly options: ScenarioPlayerOptions) {}

  get running(): boolean {
    return this.isRunning;
  }

  get remainingEvents(): number {
    return Math.max(0, this.options.events.length - this.eventIndex);
  }

  get simulatedElapsedMin(): number {
    if (!this.isRunning || this.startSimTime === 0) {
      return 0;
    }
    const elapsedMs = Math.max(0, this.options.clock.now() - this.startSimTime);
    return Number((elapsedMs / (60 * 1000)).toFixed(1));
  }

  /**
   * Starts playing the scenario asynchronously using the scalable clock.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startSimTime = this.options.clock.now();
    this.lastReadingSimTime = this.startSimTime;
    this.eventIndex = 0;
    this.seq = 1;
    this.cumulativeIn = 0;
    this.cumulativeOut = 0;
    this.currentOccupancy = 0;

    // Real wall-clock tick interval: at speed 6, ~833ms (simulates 5s per tick)
    const wallIntervalMs = Math.max(100, Math.floor(5000 / this.options.speed));

    this.timer = setInterval(async () => {
      try {
        const hasMore = await this.step(this.options.clock.now());
        if (!hasMore) {
          this.stop();
          this.options.onComplete?.();
        }
      } catch (err) {
        logger.error({ err }, 'ScenarioPlayer encountered error during playback');
        this.stop();
        this.options.onError?.(err);
      }
    }, wallIntervalMs);

    logger.info(
      {
        speed: this.options.speed,
        eventsTotal: this.options.events.length,
        wallIntervalMs,
      },
      'ScenarioPlayer started'
    );
  }

  /**
   * Executes all events due up to simulated timestamp `now`.
   * Returns true if there are more events remaining, false if all events finished.
   */
  async step(now: number): Promise<boolean> {
    if (this.startSimTime === 0) {
      this.startSimTime = now;
      this.lastReadingSimTime = now;
    }

    const simElapsedMs = now - this.startSimTime;
    let eventsProcessed = 0;

    while (this.eventIndex < this.options.events.length) {
      const event = this.options.events[this.eventIndex];
      if (!event || event.atMs > simElapsedMs) {
        break;
      }
      this.eventIndex++;
      eventsProcessed++;

      if (event.kind === 'arrive') {
        this.cumulativeIn += event.n;
        this.currentOccupancy += event.n;

        if (event.withApp) {
          for (let i = 0; i < event.n; i++) {
            const simUserId = `sim-${this.userIdCounter++}`;
            try {
              await this.options.sessionService.startSession({
                userId: simUserId,
                mealId: this.options.mealId,
                messId: this.options.messId,
                method: 'sim',
                geofence: 'unknown',
              });
            } catch (err) {
              // Non-fatal if session store rejects already_active, log warn and continue
              logger.warn({ err, simUserId }, 'Simulator session start rejected');
            }
          }
        }
      } else if (event.kind === 'leave') {
        this.cumulativeOut += event.n;
        this.currentOccupancy = Math.max(0, this.currentOccupancy - event.n);
      }
    }

    // Post an ingest camera reading if events occurred or at least 5 simulated seconds elapsed
    const simTimeSinceLastReading = now - this.lastReadingSimTime;
    if (eventsProcessed > 0 || simTimeSinceLastReading >= 5000) {
      this.lastReadingSimTime = now;
      await this.options.ingestService.recordReading(
        {
          messId: this.options.messId,
          seq: this.seq++,
          count: this.currentOccupancy,
          inCount: this.cumulativeIn,
          outCount: this.cumulativeOut,
          capturedAt: now,
        },
        now
      );

      if (this.options.alertsService) {
        await this.options.alertsService.handleTick(now, this.options.messId);
      }
    }

    return this.eventIndex < this.options.events.length;
  }

  /**
   * Stops playback and clears timers.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('ScenarioPlayer stopped');
  }
}
