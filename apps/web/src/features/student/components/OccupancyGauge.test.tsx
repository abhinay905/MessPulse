import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OccupancyGauge } from './OccupancyGauge';
import type { StatusSnapshot } from '@messpulse/shared';

const baseSnapshot: StatusSnapshot = {
  messId: 'mess-main-hall',
  mealId: '20261017-lunch',
  ts: Date.now(),
  state: 'open',
  occupancy: {
    value: 80,
    capacity: 200,
    level: 'low',
    source: 'camera',
    stale: false,
  },
  activeSessions: 50,
  decayWeightedSessions: 42,
  waitMin: 0,
  waitRangeMin: [0, 0],
  bestWindows: [],
  camera: {
    lastSeenAt: Date.now(),
    stale: false,
  },
};

describe('OccupancyGauge Component', () => {
  it('renders occupancy value, capacity, and low level badge', () => {
    render(<OccupancyGauge snapshot={baseSnapshot} />);

    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText(/of 200 seated/i)).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders medium level badge when level is medium', () => {
    const mediumSnapshot: StatusSnapshot = {
      ...baseSnapshot,
      occupancy: {
        ...baseSnapshot.occupancy,
        value: 130,
        level: 'medium',
      },
    };

    render(<OccupancyGauge snapshot={mediumSnapshot} />);
    expect(screen.getByText('130')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('renders high level badge when level is high', () => {
    const highSnapshot: StatusSnapshot = {
      ...baseSnapshot,
      occupancy: {
        ...baseSnapshot.occupancy,
        value: 190,
        level: 'high',
      },
    };

    render(<OccupancyGauge snapshot={highSnapshot} />);
    expect(screen.getByText('190')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders "Estimated" badge when stale is true', () => {
    const staleSnapshot: StatusSnapshot = {
      ...baseSnapshot,
      occupancy: {
        ...baseSnapshot.occupancy,
        stale: true,
        source: 'sessions',
      },
    };

    render(<OccupancyGauge snapshot={staleSnapshot} />);
    expect(screen.getByText('Estimated')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByText(/Session Model/i)).toBeInTheDocument();
  });

  it('displays real number when occupancy exceeds capacity (overflow)', () => {
    const overflowSnapshot: StatusSnapshot = {
      ...baseSnapshot,
      occupancy: {
        ...baseSnapshot.occupancy,
        value: 230,
        level: 'high',
      },
    };

    render(<OccupancyGauge snapshot={overflowSnapshot} />);
    expect(screen.getByText('230')).toBeInTheDocument();
    expect(screen.getByText(/of 200 seated/i)).toBeInTheDocument();
    expect(screen.getByText(/115%/i)).toBeInTheDocument();
  });
});
