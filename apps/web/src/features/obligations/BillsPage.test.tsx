import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDay } from '../../format';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';
import { formatDueDate } from './obligationText';

const TODAY = localDay();

/** The day `offset` days from today, "YYYY-MM-DD". */
function day(offset: number): string {
  const now = new Date();
  return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

interface FakeBill {
  id: string;
  name: string;
  payee?: string | null;
  dueDate: string;
  expected: number;
  actual?: number | null;
  ref?: string | null;
  paid?: { on: string; amount: number } | null;
}

const bill = (id: string, name: string, dueOffset: number, expected = 4_500): FakeBill => ({
  id,
  name,
  payee: null,
  dueDate: day(dueOffset),
  expected,
});

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

interface Failure {
  status: number;
  error: { code: string; message: string; details?: Record<string, string> };
}

function fakeApi(initial: FakeBill[]) {
  const data: FakeBill[] = initial.map((b) => ({ actual: null, ref: null, paid: null, ...b }));
  const calls: Call[] = [];
  let failLoads = 0;
  let fail: Failure | null = null;
  let hold: Promise<void> | null = null;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const failure = (f: Failure) => reply(f.status, { error: f.error });

  const amountOf = (b: FakeBill) => b.paid?.amount ?? b.actual ?? b.expected;
  const response = (b: FakeBill, asOf = TODAY) => ({
    id: b.id,
    obligationId: `o-${b.id}`,
    obligationName: b.name,
    payee: b.payee ?? null,
    categoryId: 'c1',
    categoryName: 'Electricity',
    period: b.dueDate.slice(0, 7),
    dueDate: b.dueDate,
    expectedAmountMkd: b.expected,
    actualAmountMkd: b.actual ?? null,
    invoiceRef: b.ref ?? null,
    amountMkd: amountOf(b),
    status: b.paid ? 'paid' : b.dueDate < asOf ? 'overdue' : 'due',
    paidOn: b.paid?.on ?? null,
    transactionId: b.paid ? `tx-${b.id}` : null,
  });
  const byDue = (a: FakeBill, b: FakeBill) => a.dueDate.localeCompare(b.dueDate);

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, path, ...(body ? { body } : {}) });

    if (path === '/auth/refresh') return reply(200, session);
    if (method === 'POST' && path === '/bills/sync') return reply(200, { created: 0 });

    if (method === 'GET' && path.startsWith('/bills/inbox')) {
      if (failLoads > 0) {
        failLoads -= 1;
        return reply(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
      }
      const query = new URLSearchParams(path.split('?')[1]);
      const tab = query.get('tab') as 'due' | 'overdue' | 'paid';
      const asOf = query.get('asOf') ?? TODAY;
      const unpaid = data.filter((b) => !b.paid).sort(byDue);
      const paid = data.filter((b) => b.paid).sort((a, b) => b.paid!.on.localeCompare(a.paid!.on));
      const due = unpaid.filter((b) => b.dueDate >= asOf);
      const overdue = unpaid.filter((b) => b.dueDate < asOf);
      const list = tab === 'due' ? due : tab === 'overdue' ? overdue : paid.slice(0, 50);
      return reply(200, {
        tab,
        bills: list.map((b) => response(b, asOf)),
        counts: { due: due.length, overdue: overdue.length, paid: paid.length },
      });
    }

    const write = async () => {
      if (hold) {
        const gate = hold;
        hold = null;
        await gate;
      }
      if (fail) {
        const f = fail;
        fail = null;
        return failure(f);
      }
      return null;
    };

    if (method === 'POST' && path === '/bills/pay') {
      const refused = await write();
      if (refused) return refused;
      const ids = body?.billIds as string[];
      for (const id of ids) {
        const b = data.find((x) => x.id === id)!;
        b.paid = { on: String(body?.paidOn), amount: b.actual ?? b.expected };
      }
      return reply(200, { bills: ids.map((id) => response(data.find((x) => x.id === id)!)) });
    }
    const one = /^\/bills\/([^/]+)(\/pay|\/undo-payment)?$/.exec(path);
    if (one) {
      const b = data.find((x) => x.id === one[1])!;
      const refused = await write();
      if (refused) return refused;
      if (method === 'POST' && one[2] === '/pay') {
        b.paid = {
          on: String(body?.paidOn ?? TODAY),
          amount: (body?.amountMkd as number | undefined) ?? b.actual ?? b.expected,
        };
        return reply(200, response(b));
      }
      if (method === 'POST' && one[2] === '/undo-payment') {
        b.paid = null;
        return reply(200, response(b));
      }
      if (method === 'PATCH') {
        if (body && 'actualAmountMkd' in body) b.actual = body.actualAmountMkd as number | null;
        if (body && 'invoiceRef' in body) b.ref = body.invoiceRef as string | null;
        return reply(200, response(b));
      }
    }
    return reply(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    data,
    paths: () => calls.map((c) => `${c.method} ${c.path}`),
    writes: () =>
      calls.filter(
        (c) => c.method !== 'GET' && c.path !== '/auth/refresh' && c.path !== '/bills/sync',
      ),
    failLoadsOnce: () => {
      failLoads = 1;
    },
    failNextWrite: (f: Failure) => {
      fail = f;
    },
    holdNextWrite: () => {
      let release!: () => void;
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

function renderPage(path = '/bills') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rowOf = (name: string) => screen.getByText(name).closest('li')!;
const tabButton = (name: RegExp) => screen.getByRole('tab', { name });

async function loaded() {
  await screen.findByRole('tablist', { name: 'Bills' });
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(tabButton(name));
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
}

const typeInto = async (user: ReturnType<typeof userEvent.setup>, label: RegExp, text: string) => {
  const box = screen.getByLabelText(label);
  await user.clear(box);
  if (text) await user.type(box, text);
};

describe('BillsPage: showing', () => {
  it("catches up first, then shows the Due tab for the phone's own day", async () => {
    const api = fakeApi([bill('b1', 'Electricity', 5)]);
    renderPage();
    await loaded();
    const order = api.paths();
    expect(order.indexOf('POST /bills/sync')).toBeGreaterThan(-1);
    expect(order.indexOf('POST /bills/sync')).toBeLessThan(
      order.indexOf(`GET /bills/inbox?tab=due&asOf=${TODAY}`),
    );
    expect(screen.getByText('Electricity')).toBeTruthy();
  });

  it('shows the three tabs with their counts', async () => {
    fakeApi([
      bill('b1', 'Electricity', 5),
      bill('b2', 'Water', 9),
      bill('b3', 'Rent', -3),
      { ...bill('b4', 'Internet', -10), paid: { on: day(-9), amount: 900 } },
    ]);
    renderPage();
    await loaded();
    expect(tabButton(/^Due \(2\)$/).getAttribute('aria-selected')).toBe('true');
    expect(tabButton(/^Overdue \(1\)$/)).toBeTruthy();
    expect(tabButton(/^Paid \(1\)$/)).toBeTruthy();
  });

  it('a bill due today is Due, one due yesterday is Overdue', async () => {
    fakeApi([bill('b1', 'Today', 0), bill('b2', 'Yesterday', -1)]);
    renderPage();
    await loaded();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('Yesterday')).toBeNull();
    await openTab(userEvent.setup(), /^Overdue/);
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('shows what each bill is: due date, payee, amount, euro estimate', async () => {
    fakeApi([{ ...bill('b1', 'Electricity', 5), payee: 'EVN' }]);
    renderPage();
    await loaded();
    const row = within(rowOf('Electricity'));
    expect(row.getByText(`Due ${formatDueDate({ dueDate: day(5) })} · EVN`)).toBeTruthy();
    expect(row.getByText('4,500 MKD')).toBeTruthy();
    expect(row.getByText(/^€/)).toBeTruthy();
  });

  it('says how many days late an overdue bill is, in the singular too', async () => {
    fakeApi([bill('b1', 'Rent', -3), bill('b2', 'Water', -1)]);
    renderPage();
    await loaded();
    await openTab(userEvent.setup(), /^Overdue/);
    expect(within(rowOf('Rent')).getByText('3 days late')).toBeTruthy();
    expect(within(rowOf('Water')).getByText('1 day late')).toBeTruthy();
  });

  it('puts the oldest overdue bill first and shows the total of the tab', async () => {
    fakeApi([bill('b1', 'Newer', -2, 1_000), bill('b2', 'Older', -9, 2_000)]);
    renderPage();
    await loaded();
    await openTab(userEvent.setup(), /^Overdue/);
    const names = screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent);
    expect(names).toEqual(['Older', 'Newer']);
    expect(screen.getByText(/Total:/).textContent).toContain('3,000 MKD');
  });

  it('shows a friendly line for each empty tab', async () => {
    fakeApi([]);
    renderPage();
    await loaded();
    expect(screen.getByText(/Nothing is due/)).toBeTruthy();
    const user = userEvent.setup();
    await openTab(user, /^Overdue/);
    expect(screen.getByText('Nothing is overdue.')).toBeTruthy();
    await openTab(user, /^Paid/);
    expect(screen.getByText('No bills paid yet.')).toBeTruthy();
  });

  it('does not catch up again when only the tab changes', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 5)]);
    renderPage();
    await loaded();
    await openTab(userEvent.setup(), /^Overdue/);
    expect(api.paths().filter((p) => p === 'POST /bills/sync')).toHaveLength(1);
    expect(api.paths()).toContain(`GET /bills/inbox?tab=overdue&asOf=${TODAY}`);
  });

  it('shows an error with a way to try again', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 5)]);
    api.failLoadsOnce();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load your bills.');
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(screen.getByText('Electricity')).toBeTruthy();
  });

  it('links to the recurring bills, and the home screen links here', async () => {
    fakeApi([]);
    const router = renderPage('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Bills' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/bills'));
    await loaded();
    await user.click(screen.getByRole('link', { name: 'Recurring bills' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/obligations'));
  });
});

describe('BillsPage: paying one bill', () => {
  it('asks for the day and amount, starting with today and the bill amount', async () => {
    fakeApi([bill('b1', 'Electricity', 2, 4_500)]);
    renderPage();
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pay Electricity' }));
    expect((screen.getByLabelText('Paid on') as HTMLInputElement).value).toBe(TODAY);
    expect((screen.getByLabelText(/Amount paid/) as HTMLInputElement).value).toBe('4500');
  });

  it('pays with the default day and amount, and the bill leaves the list', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2), bill('b2', 'Water', 5)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: '/bills/b1/pay',
      body: { paidOn: TODAY, amountMkd: 4_500 },
    });
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    expect(tabButton(/^Due \(1\)$/)).toBeTruthy();
    expect(tabButton(/^Paid \(1\)$/)).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
  });

  it('pays the day and the amount that were typed', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await typeInto(user, /Amount paid/, '4,380');
    const date = screen.getByLabelText('Paid on');
    await user.clear(date);
    await user.type(date, day(-1));
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]!.body).toEqual({ paidOn: day(-1), amountMkd: 4_380 });
  });

  it('shows the paid bill on the Paid tab with its day and amount', async () => {
    fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await typeInto(user, /Amount paid/, '4380');
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    await openTab(user, /^Paid/);
    const row = within(rowOf('Electricity'));
    expect(row.getByText(/^Paid /)).toBeTruthy();
    expect(row.getByText('4,380 MKD')).toBeTruthy();
    expect(row.queryByRole('checkbox')).toBeNull();
    expect(row.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  it('checks the amount and the day before sending anything', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    const submit = () => user.click(screen.getByRole('button', { name: 'Mark as paid' }));

    await typeInto(user, /Amount paid/, '');
    await submit();
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/Enter an amount/);

    await typeInto(user, /Amount paid/, '12.5');
    await submit();
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/whole denars/);

    await typeInto(user, /Amount paid/, '0');
    await submit();
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/above 0/);

    await typeInto(user, /Amount paid/, '4500');
    await user.clear(screen.getByLabelText('Paid on'));
    await submit();
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/date/i);
    expect(api.writes()).toEqual([]);
  });

  it('shows a euro estimate under the amount', async () => {
    fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await typeInto(user, /Amount paid/, '6150');
    expect(await screen.findByText(/^≈ €/)).toBeTruthy();
  });

  it("shows the server's message in the form and keeps what was typed", async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await typeInto(user, /Amount paid/, '4380');
    api.failNextWrite({
      status: 400,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        details: { paidOn: 'Date cannot be in the future' },
      },
    });
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(await screen.findByText('Date cannot be in the future')).toBeTruthy();
    expect((screen.getByLabelText(/Amount paid/) as HTMLInputElement).value).toBe('4380');
    expect(screen.getByText('Electricity')).toBeTruthy();
  });

  it('shows a note and the current list when the bill was already paid elsewhere', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2), bill('b2', 'Water', 5)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    api.data[0]!.paid = { on: TODAY, amount: 4_500 }; // paid on another device meanwhile
    api.failNextWrite({
      status: 409,
      error: { code: 'CONFLICT', message: 'This bill is already paid.' },
    });
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    const note = await screen.findByText(
      /This bill is already paid\. The list is up to date now\./,
    );
    expect(note.getAttribute('role')).toBe('status');
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    expect(screen.getByText('Water')).toBeTruthy();
    expect(screen.queryByLabelText('Paid on')).toBeNull();
  });

  it('sends one payment even when the button is pressed twice quickly', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    const release = api.holdNextWrite();
    const button = screen.getByRole('button', { name: 'Mark as paid' });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    release();
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    expect(api.writes()).toHaveLength(1);
  });

  it('cancel closes the form without paying', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Paid on')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pay Electricity' })).toBeTruthy();
    expect(api.writes()).toEqual([]);
  });

  it('while one bill is being paid the other bills wait', async () => {
    fakeApi([bill('b1', 'Electricity', 2), bill('b2', 'Water', 1)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay Electricity' }));
    expect((screen.getByRole('button', { name: 'Pay Water' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Enter invoice details for Water' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((screen.getByRole('button', { name: 'Pay Water' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe('BillsPage: actual amount and invoice reference', () => {
  it('saves them and shows the actual amount instead of the expected one', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2, 4_500)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    await typeInto(user, /Actual amount/, '4,820');
    await typeInto(user, /Invoice reference/, 'INV-2026/118');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/bills/b1',
      body: { actualAmountMkd: 4_820, invoiceRef: 'INV-2026/118' },
    });
    await waitFor(() => expect(screen.queryByLabelText(/Actual amount/)).toBeNull());
    const row = within(rowOf('Electricity'));
    expect(row.getByText('4,820 MKD')).toBeTruthy();
    expect(row.getByText('Invoice INV-2026/118')).toBeTruthy();
    expect(row.getByText('Actual amount (expected 4,500 MKD)')).toBeTruthy();
  });

  it('starts empty and says what the expected amount is', async () => {
    fakeApi([bill('b1', 'Electricity', 2, 4_500)]);
    renderPage();
    await loaded();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    expect((screen.getByLabelText(/Actual amount/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Invoice reference/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Expected 4,500 MKD/)).toBeTruthy();
  });

  it('starts with what was entered before, and empty boxes take it away again', async () => {
    const api = fakeApi([{ ...bill('b1', 'Electricity', 2), actual: 4_820, ref: 'INV-1' }]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    expect((screen.getByLabelText(/Actual amount/) as HTMLInputElement).value).toBe('4820');
    expect((screen.getByLabelText(/Invoice reference/) as HTMLInputElement).value).toBe('INV-1');
    await typeInto(user, /Actual amount/, '');
    await typeInto(user, /Invoice reference/, '');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]!.body).toEqual({ actualAmountMkd: null, invoiceRef: null });
    await waitFor(() => expect(screen.queryByLabelText(/Actual amount/)).toBeNull());
    expect(within(rowOf('Electricity')).getByText('4,500 MKD')).toBeTruthy();
  });

  it('checks the amount before sending', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    await typeInto(user, /Actual amount/, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert').textContent).toMatch(/whole denars/);
    await typeInto(user, /Actual amount/, '0');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert').textContent).toMatch(/above 0/);
    expect(api.writes()).toEqual([]);
  });

  it('the payment form then starts with the actual amount', async () => {
    fakeApi([{ ...bill('b1', 'Electricity', 2, 4_500), actual: 4_820 }]);
    renderPage();
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pay Electricity' }));
    expect((screen.getByLabelText(/Amount paid/) as HTMLInputElement).value).toBe('4820');
  });

  it('cancel closes the form without saving', async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/Actual amount/)).toBeNull();
    expect(api.writes()).toEqual([]);
  });

  it("shows the server's message when saving fails", async () => {
    const api = fakeApi([bill('b1', 'Electricity', 2)]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enter invoice details for Electricity' }));
    await typeInto(user, /Actual amount/, '5000');
    api.failNextWrite({
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong');
    expect((screen.getByLabelText(/Actual amount/) as HTMLInputElement).value).toBe('5000');
  });
});

describe('BillsPage: paying several bills', () => {
  const three = () => [
    bill('b1', 'Electricity', 3, 4_500),
    bill('b2', 'Water', 2, 800),
    bill('b3', 'Rent', 4, 20_000),
  ];

  it('shows how many are selected and what they come to', async () => {
    fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    expect(screen.queryByText(/selected/)).toBeNull();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByLabelText(/Select Water/));
    expect(screen.getByText(/2 selected/).closest('p')!.textContent).toContain('5,300 MKD');
  });

  it('pays all selected on one day, each for its own amount', async () => {
    const api = fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByLabelText(/Select Water/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    expect((screen.getByLabelText('Paid on') as HTMLInputElement).value).toBe(TODAY);
    await user.click(screen.getByRole('button', { name: 'Pay 2 bills' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: '/bills/pay',
      body: { billIds: ['b1', 'b2'], paidOn: TODAY },
    });
    expect(api.writes()[0]!.body).not.toHaveProperty('amountMkd');
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    expect(screen.queryByText('Water')).toBeNull();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(tabButton(/^Paid \(2\)$/)).toBeTruthy();
  });

  it('sends the day that was chosen', async () => {
    const api = fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Rent/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    const date = screen.getByLabelText('Paid on');
    await user.clear(date);
    await user.type(date, day(-1));
    await user.click(screen.getByRole('button', { name: 'Pay 1 bill' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]!.body).toEqual({ billIds: ['b3'], paidOn: day(-1) });
  });

  it('select all selects every bill, and again clears them', async () => {
    fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Select all'));
    expect(screen.getByText(/3 selected/).closest('p')!.textContent).toContain('25,300 MKD');
    await user.click(screen.getByLabelText('Select all'));
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('keeps the selection out of another tab', async () => {
    fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await openTab(user, /^Overdue/);
    expect(screen.queryByText(/selected/)).toBeNull();
    await openTab(user, /^Due/);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('cancel closes the day box and keeps the selection', async () => {
    const api = fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Paid on')).toBeNull();
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    expect(api.writes()).toEqual([]);
  });

  it('while the day box is open the rows wait', async () => {
    fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    expect((screen.getByRole('button', { name: 'Pay Water' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText(/Select Water/) as HTMLInputElement).disabled).toBe(true);
  });

  it('while a bill is being paid the bulk button waits', async () => {
    fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByRole('button', { name: 'Pay Water' }));
    expect(
      (screen.getByRole('button', { name: 'Mark selected as paid' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows the server's message and keeps the selection when paying fails", async () => {
    const api = fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    api.failNextWrite({
      status: 400,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        details: { paidOn: 'Date cannot be in the future' },
      },
    });
    await user.click(screen.getByRole('button', { name: 'Pay 1 bill' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Some fields are invalid.');
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    expect(screen.getByText('Electricity')).toBeTruthy();
  });

  it('shows a note and the current list when one of the bills was paid elsewhere', async () => {
    const api = fakeApi(three());
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Select Electricity/));
    await user.click(screen.getByLabelText(/Select Water/));
    await user.click(screen.getByRole('button', { name: 'Mark selected as paid' }));
    api.data[1]!.paid = { on: TODAY, amount: 800 };
    api.failNextWrite({
      status: 409,
      error: { code: 'CONFLICT', message: 'This bill is already paid.' },
    });
    await user.click(screen.getByRole('button', { name: 'Pay 2 bills' }));
    expect(await screen.findByText(/The list is up to date now\./)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Water')).toBeNull());
    expect(screen.getByText('Electricity')).toBeTruthy();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('selects at most 50 at once', async () => {
    fakeApi(Array.from({ length: 51 }, (_, i) => bill(`b${i}`, `Bill ${i}`, 1, 100)));
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Select all'));
    expect(screen.getByText(/50 selected/)).toBeTruthy();
    expect(screen.queryByText(/Select at most 50/)).toBeNull();
    await user.click(screen.getByLabelText(/Select Bill 50,/));
    expect(screen.getByText(/51 selected/)).toBeTruthy();
    expect(screen.getByText('Select at most 50 bills at once.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Mark selected as paid' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('BillsPage: undoing a payment', () => {
  const paidBill = (): FakeBill => ({
    ...bill('b1', 'Electricity', -5, 4_500),
    ref: 'INV-9',
    paid: { on: day(-4), amount: 4_380 },
  });

  it('shows paid bills with the day, the amount, the reference and a way to undo', async () => {
    fakeApi([paidBill()]);
    renderPage();
    await loaded();
    await openTab(userEvent.setup(), /^Paid/);
    const row = within(rowOf('Electricity'));
    expect(row.getByText(/^Paid /)).toBeTruthy();
    expect(row.getByText('4,380 MKD')).toBeTruthy();
    expect(row.getByText('Invoice INV-9')).toBeTruthy();
    expect(row.getByRole('button', { name: 'Undo payment of Electricity' })).toBeTruthy();
  });

  it('asks first, and keeping the payment changes nothing', async () => {
    const api = fakeApi([paidBill()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openTab(user, /^Paid/);
    await user.click(screen.getByRole('button', { name: 'Undo payment of Electricity' }));
    expect(
      screen.getByText(/Undo this payment\? The expense of 4,380 MKD is removed/),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep payment' }));
    expect(screen.queryByText(/Undo this payment/)).toBeNull();
    expect(api.writes()).toEqual([]);
  });

  it('opens the bill again, and it moves back to Due or Overdue', async () => {
    const api = fakeApi([paidBill()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openTab(user, /^Paid/);
    await user.click(screen.getByRole('button', { name: 'Undo payment of Electricity' }));
    await user.click(screen.getByRole('button', { name: 'Yes, undo payment' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({ method: 'POST', path: '/bills/b1/undo-payment' });
    await waitFor(() => expect(screen.queryByText('Electricity')).toBeNull());
    expect(screen.getByText('No bills paid yet.')).toBeTruthy();
    expect(tabButton(/^Overdue \(1\)$/)).toBeTruthy();
  });

  it('says so when it fails, and the bill stays paid', async () => {
    const api = fakeApi([paidBill()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openTab(user, /^Paid/);
    await user.click(screen.getByRole('button', { name: 'Undo payment of Electricity' }));
    api.failNextWrite({
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    await user.click(screen.getByRole('button', { name: 'Yes, undo payment' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: 'Yes, undo payment' })).toBeTruthy();
    expect(screen.getByText('Electricity')).toBeTruthy();
  });

  it('says how many payments are shown when there are more than the list holds', async () => {
    fakeApi(
      Array.from({ length: 52 }, (_, i) => ({
        ...bill(`b${i}`, `Bill ${i}`, -40, 100),
        paid: { on: day(-(i % 30) - 1), amount: 100 },
      })),
    );
    renderPage();
    await loaded();
    await openTab(userEvent.setup(), /^Paid/);
    expect(screen.getByText('Showing the latest 50 of 52 payments.')).toBeTruthy();
  });
});
