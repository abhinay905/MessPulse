/**
 * features/optouts/OptOutToggle.test.tsx — Component tests for OptOutToggle.
 * DOC4 Step 17: Done when toggle works on a phone viewport; set/unset works before cutoff.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptOutToggle } from './OptOutToggle';
import * as useOptOutModule from './hooks/useOptOut';

vi.mock('./hooks/useOptOut');

describe('OptOutToggle Component', () => {
  const mockToggleOptOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when student has not opted out (window open)', () => {
    const futureCutoff = Date.now() + 3600000; // 1 hour in future
    vi.spyOn(useOptOutModule, 'useOptOut').mockReturnValue({
      optedOut: false,
      cutoffAt: futureCutoff,
      isLoading: false,
      isUpdating: false,
      error: null,
      toggleOptOut: mockToggleOptOut,
    });

    render(<OptOutToggle mealId="meal-101" />);

    expect(screen.getByText('Skipping this meal?')).toBeInTheDocument();
    expect(screen.getByText('Help the kitchen reduce food waste')).toBeInTheDocument();

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(switchBtn).not.toBeDisabled();

    fireEvent.click(switchBtn);
    expect(mockToggleOptOut).toHaveBeenCalledTimes(1);
  });

  it('renders correctly when student has opted out', () => {
    const futureCutoff = Date.now() + 3600000;
    vi.spyOn(useOptOutModule, 'useOptOut').mockReturnValue({
      optedOut: true,
      cutoffAt: futureCutoff,
      isLoading: false,
      isUpdating: false,
      error: null,
      toggleOptOut: mockToggleOptOut,
    });

    render(<OptOutToggle mealId="meal-101" />);

    expect(screen.getByText("You've marked yourself as skipping")).toBeInTheDocument();

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    expect(switchBtn).not.toBeDisabled();

    fireEvent.click(switchBtn);
    expect(mockToggleOptOut).toHaveBeenCalledTimes(1);
  });

  it('disables switch when cutoff has passed', () => {
    const pastCutoff = Date.now() - 60000; // 1 min ago
    vi.spyOn(useOptOutModule, 'useOptOut').mockReturnValue({
      optedOut: false,
      cutoffAt: pastCutoff,
      isLoading: false,
      isUpdating: false,
      error: null,
      toggleOptOut: mockToggleOptOut,
    });

    render(<OptOutToggle mealId="meal-101" />);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeDisabled();
    expect(screen.getByText(/Closed/i)).toBeInTheDocument();
  });

  it('renders nothing if mealId is null', () => {
    vi.spyOn(useOptOutModule, 'useOptOut').mockReturnValue({
      optedOut: false,
      cutoffAt: 0,
      isLoading: false,
      isUpdating: false,
      error: null,
      toggleOptOut: mockToggleOptOut,
    });

    const { container } = render(<OptOutToggle mealId={null} />);
    expect(container.firstChild).toBeNull();
  });
});
