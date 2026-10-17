/**
 * core/scenario.test.ts — Unit tests for deterministic scenario generator.
 * DOC3 §3.9, DOC4 Step 10.
 */

import { describe, it, expect } from 'vitest';
import { buildLunchRushScenario } from './scenario';

describe('buildLunchRushScenario', () => {
  it('is 100% deterministic for the same seed', () => {
    const run1 = buildLunchRushScenario({ seed: 12345, peakPeople: 150, durationMin: 18 });
    const run2 = buildLunchRushScenario({ seed: 12345, peakPeople: 150, durationMin: 18 });

    expect(run1).toEqual(run2);
  });

  it('produces total arrivals and total leaves equal to peakPeople', () => {
    const peakPeople = 220;
    const events = buildLunchRushScenario({ seed: 42, peakPeople, durationMin: 18 });

    const totalArrive = events
      .filter((e) => e.kind === 'arrive')
      .reduce((sum, e) => sum + e.n, 0);

    const totalLeave = events
      .filter((e) => e.kind === 'leave')
      .reduce((sum, e) => sum + e.n, 0);

    expect(totalArrive).toBe(peakPeople);
    expect(totalLeave).toBe(peakPeople);
  });

  it('maintains the invariant cumulative arrivals >= cumulative leaves at all times', () => {
    const events = buildLunchRushScenario({ seed: 999, peakPeople: 200, durationMin: 18 });

    let cumulativeArrive = 0;
    let cumulativeLeave = 0;

    for (const ev of events) {
      if (ev.kind === 'arrive') {
        cumulativeArrive += ev.n;
      } else {
        cumulativeLeave += ev.n;
      }

      expect(cumulativeArrive).toBeGreaterThanOrEqual(cumulativeLeave);
    }

    expect(cumulativeArrive).toBe(cumulativeLeave);
  });

  it('respects appAdoption fraction approximately', () => {
    const peakPeople = 500;
    const appAdoption = 0.8;
    const events = buildLunchRushScenario({ seed: 777, peakPeople, appAdoption });

    const arrivalsWithApp = events
      .filter((e) => e.kind === 'arrive' && e.withApp)
      .reduce((sum, e) => sum + e.n, 0);

    const fraction = arrivalsWithApp / peakPeople;
    expect(fraction).toBeGreaterThan(0.75);
    expect(fraction).toBeLessThan(0.85);
  });

  it('events are sorted chronologically with arrivals preceding leaves at equal timestamps', () => {
    const events = buildLunchRushScenario({ seed: 42 });

    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      if (!current || !next) {
        continue;
      }

      expect(next.atMs).toBeGreaterThanOrEqual(current.atMs);
      if (next.atMs === current.atMs) {
        if (current.kind === 'leave' && next.kind === 'arrive') {
          throw new Error('Arrive should precede leave at same timestamp');
        }
      }
    }
  });

  it('works with default parameters when no options are provided', () => {
    const events = buildLunchRushScenario();
    expect(events.length).toBeGreaterThan(0);

    const totalArrive = events
      .filter((e) => e.kind === 'arrive')
      .reduce((sum, e) => sum + e.n, 0);

    // default peakPeople is 220
    expect(totalArrive).toBe(220);
  });
});

