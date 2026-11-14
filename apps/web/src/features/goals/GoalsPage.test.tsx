import type { GoalResponse } from '@nestmint/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalsPage } from './GoalsPage';

const auth = vi.hoisted(() => ({ authedGet: vi.fn(), authedSend: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

const goal = (over: Partial<GoalResponse> = {}): GoalResponse => ({
  id: 'g1',
  name: 'Car',
  kind: 'target_date',
  priority: 2,
  archived: false,
  targetMkd: 120_000,
  targetMonth: '2027-10',
  monthlyMkd: null,
  savedMkd: 24_000,
  remainingMkd: 96_000,
  progress: 0.2,
  monthsLeft: 12,
  requiredMonthlyMkd: 8_000,
  paceMkd: 4_000,
  completionMonth: '2028-10',
  achievability: 50,
  status: 'behind',
  ...over,
});

beforeEach(() => {
  auth.authedGet.mockResolvedValue({ goals: [goal()] });
  auth.authedSend.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <GoalsPage />
    </MemoryRouter>,
  );

describe('GoalsPage', () => {
  it('shows progress with the calculation behind it', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Car' })).toBeTruthy();
    expect(screen.getByText('Behind')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Car progress' }).getAttribute('aria-valuenow'),
    ).toBe('20');
    expect(screen.getByText(/you need 8,000 MKD a month/)).toBeTruthy();
    expect(screen.getByText(/Chance of meeting the date: 50%/)).toBeTruthy();
  });

  it('adds money and reloads', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('Amount for Car'), '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Add money to Car' }));
    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith('POST', '/goals/g1/contributions', {
        amountMkd: 5000,
        occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    await waitFor(() => expect(auth.authedGet).toHaveBeenCalledTimes(2));
  });

  it('takes money out as a negative amount', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('Amount for Car'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Take money out of Car' }));
    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith(
        'POST',
        '/goals/g1/contributions',
        expect.objectContaining({ amountMkd: -1000 }),
      ),
    );
  });

  it('creates a goal that has a date', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '+ New goal' }));
    await userEvent.type(screen.getByLabelText('Goal name'), 'Holiday');
    await userEvent.type(screen.getByLabelText('Target (MKD)'), '60000');
    await userEvent.type(screen.getByLabelText('Reach it by (month)'), '2027-06');
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith('POST', '/goals', {
        kind: 'target_date',
        name: 'Holiday',
        priority: 2,
        targetMkd: 60000,
        targetMonth: '2027-06',
      }),
    );
  });

  it('shows the error from the server', async () => {
    const { ApiError } = await import('../../api/client');
    auth.authedSend.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_FAILED', 'Some fields are invalid.', {
        amountMkd: 'You cannot take out more than is saved',
      }),
    );
    renderPage();
    await userEvent.type(await screen.findByLabelText('Amount for Car'), '999');
    await userEvent.click(screen.getByRole('button', { name: 'Take money out of Car' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/more than is saved/);
  });

  it('archives a goal', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Car' }));
    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith('PATCH', '/goals/g1', { archived: true }),
    );
  });
});
