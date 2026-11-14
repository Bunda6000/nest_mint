import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LedgerResponse } from '@nestmint/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

const ID = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e51';

const ledger = (over: Partial<LedgerResponse> = {}): LedgerResponse => ({
  obligationId: ID,
  name: 'Electricity',
  payee: 'EVN',
  categoryName: 'Electricity',
  year: 2026,
  years: [2025, 2026],
  rows: [
    {
      billId: 'b1',
      period: '2026-01',
      dueDate: '2026-01-15',
      invoiceRef: 'INV-1',
      amountMkd: 5_000,
      paidOn: '2026-01-20',
    },
    {
      billId: 'b2',
      period: '2026-02',
      dueDate: '2026-02-15',
      invoiceRef: null,
      amountMkd: 4_500,
      paidOn: null,
    },
  ],
  yearTotalMkd: 9_500,
  yearPaidMkd: 5_000,
  lifetimeMkd: 14_000,
  ...over,
});

function fakeApi(responses: Record<string, LedgerResponse>, fail = false) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^.*\/api\/v1/, '');
      if (path === '/auth/refresh') return new Response(JSON.stringify(session), { status: 200 });
      calls.push(path);
      if (fail)
        return new Response(JSON.stringify({ error: { code: 'X', message: 'x' } }), {
          status: 500,
        });
      const year = /year=(\d{4})/.exec(path)?.[1] ?? '2026';
      return new Response(JSON.stringify(responses[year]), { status: 200 });
    }),
  );
  return calls;
}

function renderPage(path = `/obligations/${ID}/history`) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LedgerPage', () => {
  it('shows the bills of the year with payment, invoice reference, amounts and totals', async () => {
    fakeApi({ '2026': ledger() });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Electricity' })).toBeTruthy();
    expect(screen.getByText('EVN · Electricity')).toBeTruthy();
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(screen.getByText('Paid Jan 20, 2026 · INV-1')).toBeTruthy();
    expect(screen.getAllByText('5,000 MKD')).toHaveLength(2); // the row and the year's paid total
    expect(screen.getByText('Not paid yet')).toBeTruthy();
    expect(screen.getByText('9,500 MKD')).toBeTruthy();
    expect(screen.getByText('14,000 MKD')).toBeTruthy();
    // The euro amounts are shown beside every figure.
    expect(screen.getAllByText(/€/).length).toBeGreaterThanOrEqual(5);
  });

  it('switches the year and asks the server for it', async () => {
    const calls = fakeApi({
      '2026': ledger(),
      '2025': ledger({
        year: 2025,
        rows: [
          {
            billId: 'b0',
            period: '2025-12',
            dueDate: '2025-12-15',
            invoiceRef: null,
            amountMkd: 4_000,
            paidOn: '2025-12-18',
          },
        ],
        yearTotalMkd: 4_000,
        yearPaidMkd: 4_000,
      }),
    });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('January 2026');
    await user.click(
      within(screen.getByRole('group', { name: 'Year' })).getByRole('button', { name: '2025' }),
    );
    expect(await screen.findByText('December 2025')).toBeTruthy();
    expect(screen.queryByText('January 2026')).toBeNull();
    expect(calls.at(-1)).toBe(`/obligations/${ID}/ledger?year=2025`);
  });

  it('says so when the year has no bills', async () => {
    fakeApi({ '2026': ledger({ rows: [], yearTotalMkd: 0, yearPaidMkd: 0 }) });
    renderPage();
    expect(await screen.findByText('No bills in 2026.')).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    fakeApi({}, true);
    renderPage();
    expect(await screen.findByText('Could not load the history.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
