import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrayCapacityForm } from './TrayCapacityForm';

describe('TrayCapacityForm', () => {
  it('renders with current capacity and allows submission', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <TrayCapacityForm currentCapacity={250} onUpdateCapacity={handleUpdate} />
    );

    expect(screen.getByText('Update / Refill Trays')).toBeInTheDocument();
    const input = screen.getByDisplayValue('250') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Refill/i }));

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(350);
    });
    expect(screen.getByText(/Saved & Evaluated/i)).toBeInTheDocument();
  });

  it('validates bounds (1 to 10000)', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <TrayCapacityForm onUpdateCapacity={handleUpdate} />
    );

    expect(screen.getByText('Initialize Tray Capacity')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/e\.g\. 250 portions/i);

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Capacity/i }));

    expect(
      screen.getByText(/Please enter a valid quantity between 1 and 10,000 portions/i)
    ).toBeInTheDocument();
    expect(handleUpdate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Capacity/i }));

    expect(
      screen.getByText(/Please enter a valid quantity between 1 and 10,000 portions/i)
    ).toBeInTheDocument();
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('supports quick add buttons (+50, +100, +200)', () => {
    render(
      <TrayCapacityForm currentCapacity={200} onUpdateCapacity={vi.fn()} />
    );

    const input = screen.getByDisplayValue('200') as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /\+50/i }));
    expect(input.value).toBe('250');

    fireEvent.click(screen.getByRole('button', { name: /\+100/i }));
    expect(input.value).toBe('350');

    fireEvent.click(screen.getByRole('button', { name: /\+200/i }));
    expect(input.value).toBe('550');
  });

  it('displays error when update fails', async () => {
    const handleUpdate = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <TrayCapacityForm currentCapacity={100} onUpdateCapacity={handleUpdate} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Refill/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
