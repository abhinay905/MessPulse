/**
 * core/scenario.ts — Deterministic scenario generator for demo lunch rush.
 * DOC3 §3.9, DOC1 M8, DOC4 Step 10.
 *
 * Pure domain function: no framework, no I/O, no Date.now() / Math.random().
 * Uses seeded PRNG (Mulberry32) for 100% deterministic replay.
 */

export interface ScenarioEvent {
  atMs: number; // Simulated time offset from scenario start (ms)
  kind: 'arrive' | 'leave';
  n: number;
  withApp: boolean;
}

export interface LunchRushOptions {
  seed?: number;
  durationMin?: number; // default 18 min
  peakPeople?: number;  // default 220
  appAdoption?: number; // default 0.70 (70% use check-in app)
}

/**
 * Seeded PRNG using Mulberry32 algorithm.
 * Guarantees identical output for the same seed across all platforms.
 */
function createPrng(seed: number) {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates Box-Muller standard normal random number using the given uniform PRNG.
 */
function nextGaussian(prng: () => number): number {
  const u1 = 1 - prng();
  const u2 = prng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Builds a deterministic lunch rush scenario.
 *
 * Characteristics (DOC3 §3.9):
 * - Peak arrival rate ~35% into the meal.
 * - Gaussian arrival distribution across the duration.
 * - Dwell times drawn around 40-50% of duration so occupancy rises to a peak and clears.
 * - Strictly preserves the invariant: cumulative leaves <= cumulative arrivals at all times.
 */
export function buildLunchRushScenario(options: LunchRushOptions = {}): ScenarioEvent[] {
  const seed = options.seed ?? 42;
  const durationMin = options.durationMin ?? 18;
  const peakPeople = options.peakPeople ?? 220;
  const appAdoption = options.appAdoption ?? 0.7;

  const prng = createPrng(seed);
  const totalDurationMs = durationMin * 60 * 1000;
  const peakArrivalMs = totalDurationMs * 0.35; // ~35% into the scenario
  const sigmaArrivalMs = totalDurationMs / 6;

  interface Individual {
    arriveAtMs: number;
    leaveAtMs: number;
    withApp: boolean;
  }

  const individuals: Individual[] = [];

  for (let i = 0; i < peakPeople; i++) {
    // Arrival sampled from normal distribution around peakArrivalMs
    const g = nextGaussian(prng);
    let arriveAtMs = Math.round(peakArrivalMs + g * sigmaArrivalMs);
    // Clamp arrivals within [5s, duration - 120s]
    arriveAtMs = Math.max(5000, Math.min(totalDurationMs - 120_000, arriveAtMs));

    // Dwell time: between 30% and 55% of total duration (e.g. 5.5 to 10 min for 18 min scenario)
    const dwellRatio = 0.3 + prng() * 0.25;
    const dwellMs = Math.round(totalDurationMs * dwellRatio);
    let leaveAtMs = arriveAtMs + dwellMs;
    // Ensure leaves happen before scenario ends and strictly after arrival
    leaveAtMs = Math.min(totalDurationMs - 5000, Math.max(arriveAtMs + 60_000, leaveAtMs));

    const withApp = prng() < appAdoption;

    individuals.push({ arriveAtMs, leaveAtMs, withApp });
  }

  // Sort arrivals and leaves into bucketed events (5-second resolution matching camera ingest)
  const bucketMs = 5000;
  const rawEvents: ScenarioEvent[] = [];

  for (const person of individuals) {
    const roundedArrive = Math.round(person.arriveAtMs / bucketMs) * bucketMs;
    const roundedLeave = Math.max(
      roundedArrive + bucketMs,
      Math.round(person.leaveAtMs / bucketMs) * bucketMs
    );

    rawEvents.push({
      atMs: roundedArrive,
      kind: 'arrive',
      n: 1,
      withApp: person.withApp,
    });

    rawEvents.push({
      atMs: roundedLeave,
      kind: 'leave',
      n: 1,
      withApp: person.withApp,
    });
  }

  // Group events with same atMs, kind, and withApp
  const eventMap = new Map<string, ScenarioEvent>();
  for (const ev of rawEvents) {
    const key = `${ev.atMs}:${ev.kind}:${ev.withApp}`;
    const existing = eventMap.get(key);
    if (existing) {
      existing.n += ev.n;
    } else {
      eventMap.set(key, { ...ev });
    }
  }

  const sortedEvents = Array.from(eventMap.values()).sort((a, b) => {
    if (a.atMs !== b.atMs) {
      return a.atMs - b.atMs;
    }
    // Arrive before leave at the same timestamp
    if (a.kind !== b.kind) {
      return a.kind === 'arrive' ? -1 : 1;
    }
    return 0;
  });

  return sortedEvents;
}
