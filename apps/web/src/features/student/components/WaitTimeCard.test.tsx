import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaitTimeCard } from './WaitTimeCard';
import type { StatusSnapshot } from '@messpulse/shared';

const snapshotWithWait: StatusSnapshot = {
  messId: 'mess-main-hall',
  mealId: '20261017-lunch',
  ts: Date.now(),
  state: 'open',
  occupancy: {
    value: 160,
    capacity: 200,
    level: 'high',
    source: 'camera',
    stale: false,
  },
  waitMin: 12,
  waitRangeMin: [10, 14],
  activeSessions: 60,
  decayWeightedSessions: 52,
  bestWindows: [],
  camera: {
    lastSeenAt: Date.now(),
    stale: false,
  },
};

describe('WaitTimeCard Component', () => {
  it('renders formatted wait range and active sessions count', () => {
    render(<WaitTimeCard snapshot={snapshotWithWait} />);

    expect(screen.getByText('~10–14 min')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.queryByText('Est')).not.toBeInTheDocument();
  });

  it('renders "No wait" when waitRange is [0, 0]', () => {
    const noWaitSnapshot: StatusSnapshot = {
      ...snapshotWithWait,
      waitRangeMin: [0, 0],
    };

    render(<WaitTimeCard snapshot={noWaitSnapshot} />);
    expect(screen.getByText('No wait')).toBeInTheDocument();
  });

  it('renders "Est" badge when stale is true', () => {
    const staleSnapshot: StatusSnapshot = {
      ...snapshotWithWait,
      occupancy: {
        ...snapshotWithWait.occupancy,
        stale: true,
      },
    };

    render(<WaitTimeCard snapshot={staleSnapshot} />);
    expect(screen.getByText('Est')).toBeInTheDocument();
  });
});
