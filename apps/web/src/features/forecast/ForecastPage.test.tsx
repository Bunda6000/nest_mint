import type { ForecastResponse, ScenarioResponse } from '@nestmint/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForecastPage } from './ForecastPage';

const auth = vi.hoisted(() => ({ authedGet: vi.fn(), authedSend: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

const totals = (net: number, end: number | null) => ({
  months: [
    {
      month: '2026-11',
      incomeMkd: 100_000,
      expensesMkd: 40_000,
      netMkd: 60_000,
      cumulativeNetMkd: 60_000,
      balanceMkd: end,
    },
  ],
  totalIncomeMkd: 100_000,
  totalExpensesMkd: 40_000,
  totalNetMkd: net,
  endBalanceMkd: end,
  averageNetMkd: net,
});

const forecast: ForecastResponse = {
  basedOnMonths: ['2026-10'],
  usualExpensesMkd: 40_000,
  startingBalanceMkd: null,
  startingBalanceFrom: null,
  forecast: totals(720_000, null),
};

beforeEach(() => {
  auth.authedGet.mockImplementation(async (path: string) =>
    path.startsWith('/categories')
      ? {
          groups: [
            {
              id: 'g',
              name: 'Food',
              archived: false,
              categories: [{ id: 'c1', groupId: 'g', name: 'Restaurants', archived: false }],
            },
          ],
        }
      : path.startsWith('/insights/ideas')
        ? {
            months: ['2026-10'],
            totalMonthlyMkd: 1_500,
            totalYearlyMkd: 18_000,
            ideas: [
              {
                id: 'trim:c1',
                kind: 'trim',
                categoryId: 'c1',
                categoryName: 'Restaurants',
                title: 'Spend 1,500 MKD less a month on Restaurants',
                why: 'You spend about 10,000 MKD a month on Restaurants.',
                method: '15% of 10,000 = 1,500 a month; × 12 = 18,000 a year.',
                monthlyImpactMkd: 1_500,
                yearlyImpactMkd: 18_000,
              },
            ],
          }
        : forecast,
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForecastPage />
    </MemoryRouter>,
  );

describe('ForecastPage', () => {
  it('says what the forecast is built on and reloads for another horizon', async () => {
    renderPage();
    expect(await screen.findByText(/you will have put aside/)).toBeTruthy();
    expect(screen.getByText(/usual 40,000 MKD a month/)).toBeTruthy();
    expect(screen.getByText(/Save a balance check-in/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '24 months' }));
    await waitFor(() => expect(auth.authedGet).toHaveBeenCalledWith('/forecast?months=24'));
  });

  it('sends a what-if and shows the calculation, goals and score', async () => {
    const scenario: ScenarioResponse = {
      basedOnMonths: ['2026-10'],
      usualExpensesMkd: 40_000,
      startingBalanceMkd: null,
      startingBalanceFrom: null,
      baseline: totals(720_000, null),
      scenario: totals(756_000, null),
      extraSavedMkd: 36_000,
      extraPerMonthMkd: 3_000,
      cuts: [{ categoryId: 'c1', categoryName: 'Restaurants', reduceMkd: 3_000, usualMkd: 10_000 }],
      goals: [
        {
          goalId: 'g1',
          name: 'Car',
          baselineCompletionMonth: '2027-10',
          scenarioCompletionMonth: '2027-07',
          monthsSooner: 3,
        },
      ],
      healthBefore: { score: 60, label: 'good', months: [], factors: [], improvements: [] },
      healthAfter: { score: 66, label: 'good', months: [], factors: [], improvements: [] },
    };
    auth.authedSend.mockResolvedValue(scenario);
    renderPage();
    await screen.findByText(/you will have put aside/);
    await userEvent.selectOptions(await screen.findByLabelText('Spend less on'), 'Restaurants');
    await userEvent.type(screen.getByLabelText('By (MKD a month)'), '3000');
    await userEvent.click(screen.getByRole('button', { name: 'Calculate' }));

    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith('POST', '/forecast/scenario', {
        months: 12,
        cuts: [{ categoryId: 'c1', reduceMkd: 3000 }],
      }),
    );
    expect(
      await screen.findByText(/3,000 MKD more each month × 12 months = 36,000 MKD/),
    ).toBeTruthy();
    expect(screen.getByText(/36,000 MKD a year/)).toBeTruthy();
    expect(screen.getByText(/3 months sooner/)).toBeTruthy();
    expect(screen.getByText(/Financial health score: 60/)).toBeTruthy();
  });

  it('checks the typed numbers before asking', async () => {
    renderPage();
    await screen.findByText(/you will have put aside/);
    await userEvent.type(screen.getByLabelText(/My spending changes by/), 'lots');
    await userEvent.click(screen.getByRole('button', { name: 'Calculate' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/whole denars/);
    expect(auth.authedSend).not.toHaveBeenCalled();
  });

  it('shows ideas with their calculation and can try one in the what-if', async () => {
    renderPage();
    expect(await screen.findByText(/15% of 10,000 = 1,500 a month/)).toBeTruthy();
    expect(screen.getByLabelText('Savings ideas').textContent).toContain('18,000');
    await userEvent.click(screen.getByRole('button', { name: /Try “Spend 1,500 MKD less/ }));
    expect((screen.getByLabelText('By (MKD a month)') as HTMLInputElement).value).toBe('1500');
    expect(((await screen.findByLabelText('Spend less on')) as HTMLSelectElement).value).toBe('c1');
  });
});
