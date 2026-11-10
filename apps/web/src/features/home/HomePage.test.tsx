import type { BillResponse } from '@nestmint/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';
import { shiftMonth } from '../spending/months';
import { CURRENCY_KEY } from './currency';

interface Summary {
  month: string;
  incomeMkd: number;
  expensesMkd: number;
  netMkd: number;
  savingsRate: number | null;
}

const summary = (month: string, income: number, expenses: number): Summary => ({
  month,
  incomeMkd: income,
  expensesMkd: expenses,
  netMkd: income - expenses,
  savingsRate: income === 0 ? null : (income - expenses) / income,
});

// November 2026 is the month "today" is in (8 Nov 2026); October is the month before it.
const november = () => summary('2026-11', 130_000, 40_000);
const october = () => summary('2026-10', 100_000, 50_000);

// 61,500 denars is exactly 1,000.00 euros at the default rate, so the amounts below are easy to check.
const breakdownFor = (month: string) => ({
  month,
  categories: [
    {
      categoryId: 'c1',
      categoryName: 'Groceries',
      groupId: 'g1',
      groupName: 'Food',
      amountMkd: month === '2026-11' ? 61_500 : 30_750,
    },
    {
      categoryId: 'c2',
      categoryName: 'Mortgage',
      groupId: 'g2',
      groupName: 'Banks',
      amountMkd: 15_375,
    },
  ],
  top: [
    {
      id: 't1',
      kind: 'expense',
      categoryId: 'c1',
      categoryName: 'Groceries',
      amountMkd: 30_750,
      occurredOn: `${month}-02`,
      note: 'Weekly shop',
    },
  ],
});

const historyFor = (month: string) => ({
  months: Array.from({ length: 12 }, (_, i) => ({
    month: shiftMonth(month, i - 11),
    incomeMkd: 100_000,
    expensesMkd: 60_000,
    netMkd: 40_000,
    cumulativeNetMkd: (i + 1) * 40_000,
    savingsRate: 0.4,
  })),
});

const bill = (
  id: string,
  name: string,
  dueDate: string,
  status: 'due' | 'overdue' = 'due',
  amountMkd = 6_150,
): BillResponse => ({
  id,
  obligationId: `o-${id}`,
  obligationName: name,
  payee: null,
  categoryId: 'c1',
  categoryName: 'Electricity',
  period: dueDate.slice(0, 7),
  dueDate,
  expectedAmountMkd: amountMkd,
  actualAmountMkd: null,
  invoiceRef: null,
  amountMkd,
  status,
  paidOn: null,
  transactionId: null,
});

function fakeApi(months: Summary[] = [november(), october()], bills: BillResponse[] = []) {
  const unpaid = [...bills];
  const payCalls: { id: string; body: unknown }[] = [];
  const failPayOnce = new Set<string>();
  let failBillsOnce = false;
  const requested: string[] = [];
  const held = new Map<string, Promise<void>>();
  const failOnce = new Set<string>();
  const insightCalls: string[] = [];
  const heldInsights = new Map<string, Promise<void>>();
  const failInsightsOnce = new Set<string>();
  let logoutCalls = 0;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^.*\/api\/v1/, '');
      const method = init?.method ?? 'GET';
      if (path === '/auth/refresh') return reply(200, session);
      if (path === '/auth/logout' && method === 'POST') {
        logoutCalls += 1;
        return reply(204);
      }
      const insight = /^\/insights\/(breakdown|history)\?month=(\d{4}-\d{2})$/.exec(path);
      if (insight && method === 'GET') {
        const [, kind, month] = insight as unknown as [string, 'breakdown' | 'history', string];
        insightCalls.push(`${kind}:${month}`);
        const gate = heldInsights.get(kind);
        if (gate) {
          heldInsights.delete(kind);
          await gate;
        }
        if (failInsightsOnce.delete(kind)) {
          return reply(500, {
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          });
        }
        return reply(200, kind === 'breakdown' ? breakdownFor(month) : historyFor(month));
      }
      const match = /^\/summary\?month=(\d{4}-\d{2})$/.exec(path);
      if (match && method === 'GET') {
        const month = match[1]!;
        requested.push(month);
        const gate = held.get(month);
        if (gate) {
          held.delete(month);
          await gate;
        }
        if (failOnce.delete(month)) {
          return reply(500, {
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          });
        }
        return reply(200, months.find((m) => m.month === month) ?? summary(month, 0, 0));
      }
      if (path === '/bills/sync' && method === 'POST') {
        if (failBillsOnce) {
          failBillsOnce = false;
          return reply(500, {
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          });
        }
        return reply(200, { created: 0 });
      }
      const inbox = /^\/bills\/inbox\?tab=(overdue|due)$/.exec(path);
      if (inbox && method === 'GET') {
        const tab = inbox[1] as 'overdue' | 'due';
        const list = unpaid.filter((b) => b.status === tab);
        return reply(200, { tab, bills: list, counts: { due: 0, overdue: 0, paid: 0 } });
      }
      const pay = /^\/bills\/([\w-]+)\/pay$/.exec(path);
      if (pay && method === 'POST') {
        const id = pay[1]!;
        payCalls.push({ id, body: JSON.parse(String(init?.body ?? 'null')) });
        if (failPayOnce.delete(id)) {
          return reply(409, {
            error: { code: 'BILL_ALREADY_PAID', message: 'That bill is already paid.' },
          });
        }
        const index = unpaid.findIndex((b) => b.id === id);
        if (index >= 0) unpaid.splice(index, 1);
        return reply(200, { bill: { id } });
      }
      throw new Error(`Unexpected API call: ${method} ${path}`);
    }),
  );

  return {
    requested,
    insightCalls,
    failInsights: (kind: 'breakdown' | 'history') => failInsightsOnce.add(kind),
    /** The next request for this kind of chart data waits until the returned function is called. */
    holdInsights: (kind: 'breakdown' | 'history') => {
      let release!: () => void;
      heldInsights.set(kind, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    logoutCalls: () => logoutCalls,
    payCalls,
    failPay: (id: string) => failPayOnce.add(id),
    failBills: () => {
      failBillsOnce = true;
    },
    failOnce: (month: string) => failOnce.add(month),
    /** The next request for this month waits until the returned function is called. */
    hold: (month: string) => {
      let release!: () => void;
      held.set(month, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 12, 0, 0)); // 8 Nov 2026, local time
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(months?: Summary[], bills?: BillResponse[]) {
  const api = fakeApi(months, bills);
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  const view = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { api, router, view, user: userEvent.setup() };
}

const card = (label: string) => screen.getByRole('group', { name: label });
const changeOf = (label: string) => within(card(label)).queryByTestId('change');
const valueIn = (label: string) => within(card(label)).getAllByText(/./)[1]!.textContent;
const toggle = (name: string) => screen.getByRole('button', { name });

async function ready() {
  await screen.findByRole('group', { name: 'Income' });
}

describe('the numbers', () => {
  it('shows this month in euros first, with the change against last month', async () => {
    const { api } = setup();
    await ready();

    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(api.requested.sort()).toEqual(['2026-10', '2026-11']);
    expect(valueIn('Income')).toBe('€2,113.82');
    expect(valueIn('Expenses')).toBe('€650.41');
    expect(valueIn('Net')).toBe('€1,463.41');
    expect(valueIn('Savings rate')).toBe('69.2%');
    expect(changeOf('Income')!.textContent).toContain('+€487.80 (+30%)');
    expect(changeOf('Expenses')!.textContent).toContain('−€162.60 (−20%)');
    expect(changeOf('Net')!.textContent).toContain('+€650.41 (+80%)');
    expect(changeOf('Savings rate')!.textContent).toContain('+19.2 pts');
    expect(screen.getByText('Change compared with October 2026.')).toBeTruthy();
    expect(screen.queryByText(/Example month/)).toBeNull();
  });

  it('colours a rise in income good and a fall in spending good', async () => {
    setup();
    await ready();
    expect(changeOf('Income')!.dataset.tone).toBe('good');
    expect(changeOf('Expenses')!.dataset.tone).toBe('good');
    expect(changeOf('Net')!.dataset.tone).toBe('good');
    expect(changeOf('Savings rate')!.dataset.tone).toBe('good');
  });

  it('colours everything bad when income falls and spending rises', async () => {
    setup([summary('2026-11', 80_000, 60_000), summary('2026-10', 100_000, 40_000)]);
    await ready();
    expect(changeOf('Income')!.dataset.tone).toBe('bad');
    expect(changeOf('Expenses')!.dataset.tone).toBe('bad');
    expect(changeOf('Net')!.dataset.tone).toBe('bad');
    expect(changeOf('Savings rate')!.dataset.tone).toBe('bad');
    expect(changeOf('Expenses')!.textContent).toContain('▲');
    expect(changeOf('Income')!.textContent).toContain('▼');
    expect(changeOf('Savings rate')!.textContent).toContain('−35.0 pts');
  });

  it('says "No change" when a month is the same as the one before', async () => {
    setup([summary('2026-11', 100_000, 50_000), summary('2026-10', 100_000, 50_000)]);
    await ready();
    for (const label of ['Income', 'Expenses', 'Net', 'Savings rate']) {
      expect(changeOf(label)!.textContent).toBe('No change');
      expect(changeOf(label)!.dataset.tone).toBe('neutral');
    }
  });

  it('shows "—" for the savings rate when there is no income', async () => {
    setup([summary('2026-11', 0, 12_000), summary('2026-10', 100_000, 50_000)]);
    await ready();
    expect(valueIn('Savings rate')).toBe('—');
    expect(changeOf('Savings rate')!.textContent).toBe('—');
    expect(valueIn('Net')).toBe('-€195.12');
  });
});

describe('the currency toggle', () => {
  it('starts on EUR with that button pressed', async () => {
    setup();
    await ready();
    expect(toggle('EUR').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('MKD').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches every amount to denars, and back, without loading again', async () => {
    const { api, user } = setup();
    await ready();
    const before = api.requested.length;

    await user.click(toggle('MKD'));
    expect(valueIn('Income')).toBe('130,000 MKD');
    expect(valueIn('Expenses')).toBe('40,000 MKD');
    expect(valueIn('Net')).toBe('90,000 MKD');
    expect(valueIn('Savings rate')).toBe('69.2%');
    expect(changeOf('Income')!.textContent).toContain('+30,000 MKD (+30%)');
    expect(changeOf('Expenses')!.textContent).toContain('−10,000 MKD (−20%)');
    expect(toggle('MKD').getAttribute('aria-pressed')).toBe('true');

    await user.click(toggle('EUR'));
    expect(valueIn('Income')).toBe('€2,113.82');
    expect(api.requested.length).toBe(before);
  });

  it('remembers the choice for the next visit on this device', async () => {
    const { user, view } = setup();
    await ready();
    await user.click(toggle('MKD'));
    expect(localStorage.getItem(CURRENCY_KEY)).toBe('MKD');

    view.unmount();
    const next = setup();
    await screen.findByRole('group', { name: 'Income' });
    expect(valueIn('Income')).toBe('130,000 MKD');
    expect(next.api.requested.length).toBeGreaterThan(0);
  });

  it('works when the browser will not store anything', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { user } = setup();
    await ready();
    await user.click(toggle('MKD'));
    expect(valueIn('Income')).toBe('130,000 MKD');
    vi.restoreAllMocks();
  });
});

describe('the month arrows', () => {
  it('goes back a month, loading it and the month before it', async () => {
    const { api, user } = setup();
    await ready();
    api.requested.length = 0;
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy();
    await waitFor(() => expect(valueIn('Income')).toBe('€1,626.02'));
    expect(api.requested.sort()).toEqual(['2026-09', '2026-10']);
    expect(valueIn('Expenses')).toBe('€813.01');
    // September has no data, so there is nothing to compare with.
    expect(changeOf('Income')).toBeNull();
    expect(screen.getByText('No data in September 2026 to compare with.')).toBeTruthy();
  });

  it('cannot go past the current month, but can come back to it', async () => {
    const { user } = setup();
    await ready();
    const next = () => screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await screen.findByRole('heading', { name: 'October 2026' });
    expect(next().disabled).toBe(false);
    await user.click(next());
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeTruthy();
    await waitFor(() => expect(valueIn('Income')).toBe('€2,113.82'));
    expect(next().disabled).toBe(true);
  });

  it('crosses a year boundary going back', async () => {
    const { api, user } = setup([summary('2026-01', 50_000, 20_000)]);
    await ready();
    for (const heading of ['October 2026', 'September 2026']) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      await screen.findByRole('heading', { name: heading });
    }
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
    }
    expect(await screen.findByRole('heading', { name: 'January 2026' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: 'December 2025' })).toBeTruthy();
    await waitFor(() => expect(api.requested).toContain('2025-11'));
  });

  it('keeps the chosen currency while moving between months', async () => {
    const { user } = setup();
    await ready();
    await user.click(toggle('MKD'));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await screen.findByRole('heading', { name: 'October 2026' });
    await waitFor(() => expect(valueIn('Income')).toBe('100,000 MKD'));
  });

  it('shows "Loading…" rather than the old month\'s numbers while a month loads', async () => {
    const { api, user } = setup();
    await ready();
    const release = api.hold('2026-10');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(screen.queryByRole('group', { name: 'Income' })).toBeNull();

    release();
    await waitFor(() => expect(valueIn('Income')).toBe('€1,626.02'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a slow answer for a month you have already left', async () => {
    const { api, user } = setup();
    await ready();
    const release = api.hold('2026-10');

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await screen.findByRole('heading', { name: 'October 2026' });
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await screen.findByRole('heading', { name: 'November 2026' });
    await waitFor(() => expect(valueIn('Income')).toBe('€2,113.82'));

    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(valueIn('Income')).toBe('€2,113.82');
  });
});

describe('comparing and empty months', () => {
  it('compares only when last month has data', async () => {
    setup([november()]);
    await ready();
    expect(changeOf('Income')).toBeNull();
    expect(changeOf('Savings rate')).toBeNull();
    expect(screen.getByText('No data in October 2026 to compare with.')).toBeTruthy();
    expect(valueIn('Income')).toBe('€2,113.82');
  });

  it('compares with a last month that only had spending', async () => {
    setup([november(), summary('2026-10', 0, 30_000)]);
    await ready();
    expect(changeOf('Income')!.textContent).toContain('+€2,113.82');
    expect(changeOf('Income')!.textContent).not.toContain('%');
    expect(changeOf('Savings rate')!.textContent).toBe('—');
  });

  it('says so when nothing is recorded in the month, and still shows zeros', async () => {
    setup([]);
    await ready();
    expect(screen.getByText('Nothing recorded in November 2026 yet.')).toBeTruthy();
    expect(valueIn('Income')).toBe('€0.00');
    expect(valueIn('Savings rate')).toBe('—');
  });

  it('does not say that when the month has data', async () => {
    setup();
    await ready();
    expect(screen.queryByText(/Nothing recorded/)).toBeNull();
  });
});

describe('when loading fails', () => {
  it('offers a retry that loads the month', async () => {
    const api = fakeApi();
    api.failOnce('2026-11');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load this month.');
    expect(screen.queryByRole('group', { name: 'Income' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
    expect(valueIn('Income')).toBe('€2,113.82');
  });

  it('still lets you change month and currency after an error', async () => {
    const api = fakeApi();
    api.failOnce('2026-11');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy();
    await waitFor(() => expect(valueIn('Income')).toBe('€1,626.02'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the charts', () => {
  const headings = ['Spending by group', 'Income vs expenses', 'Savings trend', 'Top 5 expenses'];
  const chartsReady = () => screen.findByRole('heading', { name: 'Spending by group' });
  const legend = () =>
    within(screen.getByRole('heading', { name: 'Spending by group' }).parentElement!)
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('shows the four charts under the numbers, for the month shown', async () => {
    const { api } = setup();
    await chartsReady();
    for (const name of headings) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(api.insightCalls.sort()).toEqual(['breakdown:2026-11', 'history:2026-11']);
    expect(legend()).toEqual(['Food€1,000.0080%', 'Banks€250.0020%']);
    expect(screen.getByText(/Running total:/).textContent).toBe('Running total: €7,804.88');
    expect(screen.getByText('Weekly shop')).toBeTruthy();
    const top = screen.getByRole('heading', { name: 'Top 5 expenses' }).parentElement!;
    expect(within(top).getByRole('listitem').textContent).toBe(
      '1Weekly shopGroceries · Nov 2€500.00',
    );
  });

  it('switches the chart amounts with the currency, without loading again', async () => {
    const { api, user } = setup();
    await chartsReady();
    const calls = api.insightCalls.length;

    await user.click(toggle('MKD'));
    expect(legend()).toEqual(['Food61,500 MKD80%', 'Banks15,375 MKD20%']);
    expect(screen.getByText(/Running total:/).textContent).toBe('Running total: 480,000 MKD');
    expect(api.insightCalls.length).toBe(calls);
  });

  it('loads the charts of the month you go back to', async () => {
    const { api, user } = setup();
    await chartsReady();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    await waitFor(() => expect(api.insightCalls).toContain('breakdown:2026-10'));
    expect(api.insightCalls).toContain('history:2026-10');
    await waitFor(() => expect(legend()).toEqual(['Food€500.0067%', 'Banks€250.0033%']));
    const top = screen.getByRole('heading', { name: 'Top 5 expenses' }).parentElement!;
    expect(within(top).getByRole('listitem').textContent).toContain('Groceries · Oct 2');
  });

  it('does not show charts of the month you left while the next one loads', async () => {
    const { api, user } = setup();
    await chartsReady();
    const release = api.hold('2026-10');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await screen.findByRole('heading', { name: 'October 2026' });
    expect(screen.queryByRole('heading', { name: 'Spending by group' })).toBeNull();
    release();
    await chartsReady();
  });

  it('shows the numbers at once while the charts are still loading', async () => {
    const api = fakeApi();
    const release = api.holdInsights('history');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    await ready();
    expect(valueIn('Income')).toBe('€2,113.82');
    expect(screen.getByText('Loading charts…')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Spending by group' })).toBeNull();
    release();
    await chartsReady();
    expect(screen.queryByText('Loading charts…')).toBeNull();
  });

  it('keeps the numbers when the charts fail, and a retry brings the charts', async () => {
    const api = fakeApi();
    api.failInsights('breakdown');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the charts.');
    expect(valueIn('Income')).toBe('€2,113.82');
    expect(screen.queryByRole('heading', { name: 'Spending by group' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try charts again' }));
    await chartsReady();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the rest of the page', () => {
  it('greets you and links to the other screens', async () => {
    setup();
    await ready();
    expect(screen.getByText('Hello, Filip.')).toBeTruthy();
    expect(
      (screen.getByRole('link', { name: 'Add expense' }) as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/expenses/new');
    for (const [name, href] of [
      ['Expenses', '/transactions'],
      ['Income', '/income'],
      ['Categories', '/categories'],
    ]) {
      expect(screen.getByRole('link', { name: name! }).getAttribute('href')).toBe(href);
    }
  });

  it('shows the links even while the numbers load', async () => {
    const api = fakeApi();
    api.hold('2026-11');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    expect((await screen.findByRole('status')).textContent).toBe('Loading…');
    expect(screen.getByRole('link', { name: 'Add expense' })).toBeTruthy();
  });

  it('logs out', async () => {
    const { api, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(api.logoutCalls()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Income' })).toBeNull());
  });
});

describe('needs attention', () => {
  const panel = () => screen.queryByRole('region', { name: 'Needs attention' });

  it('shows nothing when no bill is overdue or due soon', async () => {
    setup(undefined, [bill('b1', 'Heating', '2026-11-30')]);
    await ready();
    expect(panel()).toBeNull();
  });

  it('lists overdue bills and bills due within a week, but not later ones', async () => {
    setup(undefined, [
      bill('b1', 'Water', '2026-11-01', 'overdue'),
      bill('b2', 'Electricity', '2026-11-12'),
      bill('b3', 'Kindergarten', '2026-11-15'),
      bill('b4', 'Heating', '2026-11-16'),
    ]);
    await ready();
    const region = await screen.findByRole('region', { name: 'Needs attention' });
    const items = within(region).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('p')!.textContent)).toEqual([
      'Water',
      'Electricity',
      'Kindergarten',
    ]);
    expect(items[0]!.textContent).toContain('7 days late');
    expect(items[0]!.textContent).toContain('was due Nov 1');
    expect(items[1]!.textContent).toContain('Due Nov 12');
    expect(items[1]!.textContent).toContain('€100.00');
  });

  it('shows the amounts in the chosen currency', async () => {
    const { user } = setup(undefined, [bill('b1', 'Water', '2026-11-10')]);
    const region = await screen.findByRole('region', { name: 'Needs attention' });
    expect(region.textContent).toContain('€100.00');
    await user.click(toggle('MKD'));
    expect(region.textContent).toContain('6,150 MKD');
  });

  it('pays a bill with one tap, takes it off the list and refreshes the numbers', async () => {
    const { api, user } = setup(undefined, [
      bill('b1', 'Water', '2026-11-01', 'overdue'),
      bill('b2', 'Electricity', '2026-11-12'),
    ]);
    await ready();
    await screen.findByRole('region', { name: 'Needs attention' });
    const summaryCallsBefore = api.requested.length;

    await user.click(screen.getByRole('button', { name: 'Mark Water as paid' }));

    await waitFor(() => expect(api.payCalls).toEqual([{ id: 'b1', body: {} }]));
    await waitFor(() => expect(screen.queryByText('Water')).toBeNull());
    expect(screen.getByText('Electricity')).toBeTruthy();
    await waitFor(() => expect(api.requested.length).toBeGreaterThan(summaryCallsBefore));
  });

  it('hides the panel once the last bill is paid', async () => {
    const { user } = setup(undefined, [bill('b1', 'Water', '2026-11-10')]);
    await user.click(await screen.findByRole('button', { name: 'Mark Water as paid' }));
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('keeps the bill and says why when paying fails', async () => {
    const { api, user } = setup(undefined, [bill('b1', 'Water', '2026-11-10')]);
    api.failPay('b1');
    await user.click(await screen.findByRole('button', { name: 'Mark Water as paid' }));
    expect((await screen.findByRole('alert')).textContent).toContain('That bill is already paid.');
    expect(screen.getByText('Water')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Mark Water as paid' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('says so when the bills cannot be checked, keeps the numbers, and a retry brings the list', async () => {
    const { api, user } = setup(undefined, [bill('b1', 'Water', '2026-11-10')]);
    api.failBills();
    await ready();
    expect(valueIn('Income')).toBe('€2,113.82');
    expect((await screen.findByRole('alert')).textContent).toContain('Could not check your bills');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Needs attention' })).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('links to the budget grid', async () => {
    setup();
    await ready();
    expect(screen.getByRole('link', { name: 'Budget' }).getAttribute('href')).toBe('/budget');
  });
});
