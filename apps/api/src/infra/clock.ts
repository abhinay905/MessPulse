/**
 * infra/clock.ts — Clock port + implementations.
 * All production code calls clock.now() rather than Date.now() directly.
 * DOC3 §3.1 / DOC3 §3.0 #6 (demo clock for simulator).
 */

export interface Clock {
  now(): number; // epoch ms
}

/** Production: reads wall-clock time. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/**
 * SwitchableClock wraps either a SystemClock or a ScalableClock.
 * The simulator swaps in a ScalableClock and restores the original in finally{}.
 * Only container.ts creates a SwitchableClock; services receive the Clock port.
 */
export class SwitchableClock implements Clock {
  private inner: Clock;

  constructor(initial: Clock = new SystemClock()) {
    this.inner = initial;
  }

  now(): number {
    return this.inner.now();
  }

  use(clock: Clock): void {
    this.inner = clock;
  }

  restore(): void {
    this.inner = new SystemClock();
  }
}

/**
 * ScalableClock — advances faster than wall time.
 * epoch = baseEpoch + (wallNow - wallStart) * speed
 * Used by the simulator (DOC3 §3.9); never used in production.
 */
export class ScalableClock implements Clock {
  private readonly wallStart: number;
  private readonly baseEpoch: number;
  private readonly speed: number;

  constructor(baseEpoch: number, speed: number) {
    this.wallStart = Date.now();
    this.baseEpoch = baseEpoch;
    this.speed = speed;
  }

  now(): number {
    return this.baseEpoch + (Date.now() - this.wallStart) * this.speed;
  }
}
