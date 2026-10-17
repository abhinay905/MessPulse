import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsForm } from './SettingsForm';
import type { SettingsDTO } from '@messpulse/shared';

const mockSettings: SettingsDTO = {
  messId: 'mess-main-hall',
  capacity: 200,
  servicePerMin: 12,
  demandFactor: 0,
  baseMealMin: 18,
  maxSessionMin: 60,
  staleCameraSec: 30,
  alertCooldownSec: 180,
  updatedAt: 1700000000000,
};

describe('SettingsForm', () => {
  const mockOnUpdate = vi.fn().mockResolvedValue(true);
  const mockOnReload = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders settings fields populated with existing values', () => {
    render(
      <SettingsForm
        settings={mockSettings}
        isLoading={false}
        isSaving={false}
        error={null}
        fieldErrors={{}}
        isConflict={false}
        onUpdate={mockOnUpdate}
        onReload={mockOnReload}
      />
    );

    expect(screen.getByTestId('input-capacity')).toHaveValue(200);
    expect(screen.getByTestId('input-service-rate')).toHaveValue(12);
    expect(screen.getByTestId('input-demand-factor')).toHaveValue(0);
    expect(screen.getByTestId('input-base-meal')).toHaveValue(18);
    expect(screen.getByTestId('input-max-session')).toHaveValue(60);
  });

  it('submits updated values when form is saved', async () => {
    render(
      <SettingsForm
        settings={mockSettings}
        isLoading={false}
        isSaving={false}
        error={null}
        fieldErrors={{}}
        isConflict={false}
        onUpdate={mockOnUpdate}
        onReload={mockOnReload}
      />
    );

    const capacityInput = screen.getByTestId('input-capacity');
    fireEvent.change(capacityInput, { target: { value: '250' } });

    const submitBtn = screen.getByTestId('save-settings-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          capacity: 250,
          servicePerMin: 12,
        })
      );
    });
  });

  it('renders per-field validation errors from 422 response', () => {
    render(
      <SettingsForm
        settings={mockSettings}
        isLoading={false}
        isSaving={false}
        error="Validation failed"
        fieldErrors={{
          capacity: 'Capacity must be greater than zero',
          demandFactor: 'Demand factor must be between 0 and 5',
        }}
        isConflict={false}
        onUpdate={mockOnUpdate}
        onReload={mockOnReload}
      />
    );

    expect(screen.getByText('Capacity must be greater than zero')).toBeInTheDocument();
    expect(screen.getByText('Demand factor must be between 0 and 5')).toBeInTheDocument();
  });

  it('displays conflict banner on 409 and calls reload when requested', () => {
    render(
      <SettingsForm
        settings={mockSettings}
        isLoading={false}
        isSaving={false}
        error="Settings were modified elsewhere"
        fieldErrors={{}}
        isConflict={true}
        onUpdate={mockOnUpdate}
        onReload={mockOnReload}
      />
    );

    expect(screen.getByText(/Settings were modified by another administrator/i)).toBeInTheDocument();
    const reloadBtn = screen.getByRole('button', { name: /Reload/i });
    fireEvent.click(reloadBtn);
    expect(mockOnReload).toHaveBeenCalled();
  });
});
