/**
 * modules/simulator/simulator.service.ts — manages simulator lifecycle, clock scaling, and data injection.
 * DOC3 §3.9, DOC4 Step 10.
 *
 * Enforces:
 * - ALLOW_SIMULATOR=true guard (throws 403 SIMULATOR_DISABLED if false/unset)
 * - Single running instance (throws 409 SIMULATOR_RUNNING if already active)
 * - Restores SystemClock and removes sim-* sessions on stop or error (finally{})
 */

import crypto from 'node:crypto';
import type { SimulatorStatus } from '@messpulse/shared';
import { buildLunchRushScenario } from '../../core/scenario';
import { ScalableClock, type SwitchableClock } from '../../infra/clock';
import type { IngestService } from '../ingest/ingest.service';
import type { SessionService } from '../sessions/sessions.service';
import type { MealRepository, SessionStore } from '../../core/ports';
import { ScenarioPlayer } from './scenario-player';
import { ConflictError, ForbiddenError, ValidationError } from '../../shared-kernel/errors';
import { logger } from '../../infra/logger';

export interface SimulatorServiceDeps {
  clock: SwitchableClock;
  ingestService: IngestService;
  sessionService: SessionService;
  sessionStore: SessionStore;
  mealRepo: MealRepository;
  allowSimulator: boolean;
  defaultMessId?: string;
}

export interface SimulatorStartOptions {
  speed?: number | undefined;
  peakPeople?: number | undefined;
  durationMin?: number | undefined;
  appAdoption?: number | undefined;
  seed?: number | undefined;
  messId?: string | undefined;
  mealId?: string | undefined;
}

export class SimulatorService {
  private readonly clock: SwitchableClock;
  private readonly ingestService: IngestService;
  private readonly sessionService: SessionService;
  private readonly sessionStore: SessionStore;
  private readonly mealRepo: MealRepository;
  private readonly allowSimulator: boolean;
  private readonly defaultMessId: string;

  private currentPlayer: ScenarioPlayer | null = null;
  private currentRunId: string | null = null;
  private currentSpeed: number | null = null;
  private currentMealId: string | null = null;
  private lastError: string | null = null;

  constructor(deps: SimulatorServiceDeps) {
    this.clock = deps.clock;
    this.ingestService = deps.ingestService;
    this.sessionService = deps.sessionService;
    this.sessionStore = deps.sessionStore;
    this.mealRepo = deps.mealRepo;
    this.allowSimulator = deps.allowSimulator;
    this.defaultMessId = deps.defaultMessId || 'mess-main-hall';
  }

  /**
   * Boot-time cleanup: cleans lingering sim-* sessions from past runs.
   */
  async bootCleanup(): Promise<void> {
    try {
      const activeMeal = await this.mealRepo.findActiveOrUpcoming(
        this.defaultMessId,
        this.clock.now(),
        24 * 3600 * 1000
      );
      if (activeMeal) {
        await this.cleanupSimSessions(activeMeal.mealId);
      }
    } catch (err) {
      logger.warn({ err }, 'Simulator boot cleanup encountered non-fatal error');
    }
  }

  /**
   * Starts a simulated lunch rush.
   * Swaps in ScalableClock, seeds baseline, starts player.
   */
  async start(input: SimulatorStartOptions = {}): Promise<{ runId: string }> {
    if (!this.allowSimulator) {
      throw new ForbiddenError(
        'Simulator is disabled in this environment.',
        undefined,
        'SIMULATOR_DISABLED'
      );
    }

    if (this.currentPlayer?.running) {
      throw new ConflictError(
        'Simulator is already running.',
        undefined,
        'SIMULATOR_RUNNING'
      );
    }

    const speed = input.speed ?? 6;
    if (speed < 1 || speed > 30) {
      throw new ValidationError('Simulator speed must be between 1x and 30x.');
    }

    const peakPeople = input.peakPeople ?? 220;
    const durationMin = input.durationMin ?? 18;
    const appAdoption = input.appAdoption ?? 0.7;
    const seed = input.seed ?? 42;
    const messId = input.messId || this.defaultMessId;

    let meal = input.mealId
      ? await this.mealRepo.findByMealId(messId, input.mealId)
      : null;

    if (!meal) {
      meal = await this.mealRepo.findActiveOrUpcoming(
        messId,
        this.clock.now(),
        24 * 3600 * 1000
      );
    }

    // If no meal found, seed a scenario meal so the simulator always functions cleanly
    if (!meal) {
      const now = Date.now();
      meal = await this.mealRepo.upsert({
        messId,
        mealId: `sim-meal-${now}`,
        type: 'lunch',
        startsAt: now - 60_000,
        endsAt: now + durationMin * 60 * 1000 * 3,
        menuItems: ['Dal Tadka', 'Jeera Rice', 'Paneer Butter Masala'],
        menuDemandFactorMin: 1,
        trayCapacity: 300,
      });
    }

    this.currentMealId = meal.mealId;

    // Clean any prior sim sessions for this meal before starting
    await this.cleanupSimSessions(meal.mealId);

    // Build deterministic scenario events
    const events = buildLunchRushScenario({
      seed,
      durationMin,
      peakPeople,
      appAdoption,
    });

    // Swap clock to ScalableClock
    const scalableClock = new ScalableClock(Date.now(), speed);
    this.clock.use(scalableClock);

    const runId = crypto.randomUUID();
    this.currentRunId = runId;
    this.currentSpeed = speed;
    this.lastError = null;

    this.currentPlayer = new ScenarioPlayer({
      events,
      clock: this.clock,
      ingestService: this.ingestService,
      sessionService: this.sessionService,
      messId: meal.messId,
      mealId: meal.mealId,
      speed,
      onComplete: async () => {
        logger.info({ runId }, 'Simulator scenario completed successfully');
        await this.stop();
      },
      onError: async (err) => {
        this.lastError = err instanceof Error ? err.message : String(err);
        logger.error({ err, runId }, 'Simulator scenario encountered playback error');
        await this.stop();
      },
    });

    this.currentPlayer.start();
    return { runId };
  }

  /**
   * Stops simulation, restores SystemClock, and removes sim-* sessions.
   */
  async stop(): Promise<void> {
    try {
      if (this.currentPlayer) {
        this.currentPlayer.stop();
        this.currentPlayer = null;
      }
    } finally {
      // Always restore real clock
      this.clock.restore();
    }

    if (this.currentMealId) {
      await this.cleanupSimSessions(this.currentMealId);
      this.currentMealId = null;
    }

    this.currentRunId = null;
    this.currentSpeed = null;
    logger.info('Simulator stopped and real clock restored');
  }

  /**
   * Returns current simulator status.
   */
  status(): SimulatorStatus {
    const isRunning = this.currentPlayer?.running ?? false;
    return {
      running: isRunning,
      runId: this.currentRunId,
      speed: this.currentSpeed,
      simulatedElapsedMin: this.currentPlayer?.simulatedElapsedMin ?? null,
      eventsRemaining: this.currentPlayer?.remainingEvents ?? null,
      error: this.lastError,
    };
  }

  /**
   * Removes all active sessions created by the simulator (prefixed with 'sim-').
   */
  async cleanupSimSessions(mealId: string): Promise<number> {
    try {
      const active = await this.sessionStore.listActive(mealId, 0);
      let removedCount = 0;
      for (const s of active) {
        if (s.userId.startsWith('sim-')) {
          await this.sessionStore.end(s.userId, s.mealId);
          removedCount++;
        }
      }
      return removedCount;
    } catch (err) {
      logger.warn({ err, mealId }, 'Failed to cleanup sim sessions');
      return 0;
    }
  }
}
