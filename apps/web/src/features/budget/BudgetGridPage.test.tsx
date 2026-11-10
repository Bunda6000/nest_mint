import type { BudgetCellResponse, BudgetGridResponse } from '@nestmint/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { mockApi, session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';
import { CURRENCY_KEY } from '../home/currency';

const cell = (actualMkd: number, plannedMkd: number | null = null): BudgetCellResponse => ({
  plannedMkd,
  actualMkd,
});
const zeros = (): BudgetCellResponse[] => Array.from({ length: 12 }, () => cell(0));
const row = (first: BudgetCellResponse, total: BudgetCellResponse) => {
  const months = zeros();
  months[0] = first;
  return { months, total };
};

// 61,500 denars is exactly 1,000 euros at the default rate.
function gridFor(year: number): BudgetGridResponse {
  const income = Array.from({ length: 12 }, () => 123_000);
  const home = row(cell(12_300, 6_150), cell(12_300, 6_150));
  const child = row(cell(61_500), cell(61_500));
  const expenses = zeros();
  expenses[0] = cell(73_800, 6_150);
  const net = income.map((v, i) => v - expenses[i]!.actualMkd);
  net[0] = 123_000 - 73_800;
  return {
    year,
    months: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    incomeMkd: income,
    incomeTotalMkd: 123_000 * 12,
    groups: [
      { groupId: 'home', groupName: 'Home', ...home },
      { groupId: 'child', groupName: 'Child', ...child },
    ],
    expenses,
    expensesTotal: cell(73_800, 6_150),
    netMkd: net,
    netTotalMkd: 123_000 * 12 - 73_800,
    savingsRate: net.map((v, i) => v / income[i]!),
    savingsRateTotal: (123_000 * 12 - 73_800) / (123_000 * 12),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 12, 0, 0)); // 8 Nov 2026
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(grids: Record<number, BudgetGridResponse | { status: number }> = {}) {
  const handlers: Parameters<typeof mockApi>[0] = {
    'POST /auth/refresh': { status: 200, body: session },
  };
  for (const year of [2025, 2026]) {
    const grid = grids[year] ?? gridFor(year);
    handlers[`GET /budget?year=${year}`] =
      'status' in grid
        ? { status: grid.status, body: { error: { code: 'INTERNAL_ERROR', message: 'Oops' } } }
        : { status: 200, body: grid };
  }
  const api = mockApi(handlers);
  const router = createMemoryRouter(routes, { initialEntries: ['/budget'] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { api, router, user: userEvent.setup() };
}

const table = async () => screen.findByRole('table', { name: /Budget 2026/ });
const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });
const cells = (r: HTMLElement) =>
  within(r)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('the budget grid page', () => {
  it('shows this year: twelve months and a year column, then income, groups, expenses, net and savings rate', async () => {
    setup();
    const t = await table();
    expect(screen.getByRole('heading', { name: '2026' })).toBeTruthy();
    const headers = within(t)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers.slice(1)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Year',
    ]);
    const rowNames = within(t)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(rowNames).toEqual(['Income', 'Home', 'Child', 'Expenses', 'Net', 'Savings rate']);
  });

  it('shows euros first, as whole numbers', async () => {
    setup();
    await table();
    expect(cells(rowOf('Income'))[0]).toBe('2,000');
    expect(cells(rowOf('Child'))[0]).toBe('1,000');
    expect(cells(rowOf('Child'))[1]).toBe('–');
    expect(cells(rowOf('Expenses'))[12]).toBe('1,200');
  });

  it('switches to denars, and remembers the choice', async () => {
    const { user } = setup();
    await table();
    await user.click(screen.getByRole('button', { name: 'MKD' }));
    expect(cells(rowOf('Income'))[0]).toBe('123,000');
    expect(cells(rowOf('Child'))[0]).toBe('61,500');
    expect(localStorage.getItem(CURRENCY_KEY)).toBe('MKD');
  });

  it('shows the plan under the spending, and flags spending over the plan', async () => {
    setup();
    await table();
    const home = rowOf('Home');
    expect(cells(home)[0]).toContain('200');
    expect(cells(home)[0]).toContain('plan 100');
    expect(cells(home)[0]).toContain('(over plan)');
  });

  it('shows no plan for a group without bills, and never calls it over plan', async () => {
    setup();
    await table();
    const child = cells(rowOf('Child'))[0]!;
    expect(child).not.toContain('plan');
    expect(child).not.toContain('over plan');
  });

  it('shows a month without income as "—" for the savings rate and a loss in minus', async () => {
    const grid = gridFor(2026);
    grid.incomeMkd[1] = 0;
    grid.netMkd[1] = -6_150;
    grid.savingsRate[1] = null;
    setup({ 2026: grid });
    await table();
    expect(cells(rowOf('Savings rate'))[1]).toBe('—');
    expect(cells(rowOf('Net'))[1]).toBe('−100');
  });

  it('goes back a year, and cannot go past this year', async () => {
    const { api, user } = setup();
    await table();
    const next = screen.getByRole('button', { name: 'Next year' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(await screen.findByRole('table', { name: /Budget 2025/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2025' })).toBeTruthy();
    expect(api.calls('GET /budget?year=2025')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Next year' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('says so when the budget cannot be loaded, and a retry brings it', async () => {
    let fail = true;
    const api = mockApi({
      'POST /auth/refresh': { status: 200, body: session },
      'GET /budget?year=2026': () =>
        fail
          ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Oops' } } }
          : { status: 200, body: gridFor(2026) },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/budget'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the budget');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await table()).toBeTruthy();
    expect(api.calls('GET /budget?year=2026')).toHaveLength(2);
  });

  it('leads back to Home', async () => {
    setup();
    await table();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
  });
});
