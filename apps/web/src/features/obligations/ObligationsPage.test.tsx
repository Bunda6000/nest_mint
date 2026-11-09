import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';
import { currentMonth } from '../spending/months';

const MONTH = currentMonth();
// Real category ids are UUIDs, and the form refuses anything else.
const ELECTRICITY_ID = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e51';
const WATER_ID = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e52';

interface Obl {
  id: string;
  name: string;
  payee: string | null;
  categoryId: string;
  categoryName: string;
  expectedAmountMkd: number;
  dueDay: number;
  recurrence: 'monthly' | 'every_n_months' | 'custom_months';
  everyNMonths: number | null;
  months: number[] | null;
  startMonth: string;
  endMonth: string | null;
}

const groups = [
  {
    id: 'g1',
    name: 'Home',
    categories: [
      { id: ELECTRICITY_ID, name: 'Electricity' },
      { id: WATER_ID, name: 'Water' },
    ],
  },
];

const electricity = (): Obl => ({
  id: 'o1',
  name: 'Electricity',
  payee: 'EVN',
  categoryId: ELECTRICITY_ID,
  categoryName: 'Electricity',
  expectedAmountMkd: 4_500,
  dueDay: 15,
  recurrence: 'monthly',
  everyNMonths: null,
  months: null,
  startMonth: '2026-01',
  endMonth: null,
});

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function fakeApi(initial: Obl[] = [electricity()]) {
  const data = [...initial];
  const calls: Call[] = [];
  let failLoads = 0;
  let failPost: { status: number; error: Record<string, unknown> } | null = null;
  let holdPost: Promise<void> | null = null;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  const billsOf = () =>
    data
      .slice()
      .sort((a, b) => a.dueDay - b.dueDay)
      .map((o) => ({
        id: `b-${o.id}`,
        obligationId: o.id,
        obligationName: o.name,
        payee: o.payee,
        categoryId: o.categoryId,
        categoryName: o.categoryName,
        period: MONTH,
        dueDate: `${MONTH}-${String(o.dueDay).padStart(2, '0')}`,
        expectedAmountMkd: o.expectedAmountMkd,
      }));

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, path, ...(body ? { body } : {}) });

    if (path === '/auth/refresh') return reply(200, session);
    if (method === 'GET' && path === '/categories') {
      if (failLoads > 0) {
        failLoads -= 1;
        return reply(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
      }
      return reply(200, { groups });
    }
    if (method === 'GET' && path === '/obligations') {
      return reply(200, { obligations: [...data].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (method === 'POST' && path === `/bills/generate?month=${MONTH}`) {
      return reply(200, { month: MONTH, created: 0 });
    }
    if (method === 'GET' && path === `/bills?month=${MONTH}`)
      return reply(200, { bills: billsOf() });
    if (method === 'POST' && path === '/obligations') {
      if (holdPost) {
        const gate = holdPost;
        holdPost = null;
        await gate;
      }
      if (failPost) {
        const { status, error } = failPost;
        failPost = null;
        return reply(status, { error });
      }
      const created: Obl = {
        id: `o${data.length + 10}`,
        name: String(body?.name),
        payee: (body?.payee as string | null | undefined) ?? null,
        categoryId: String(body?.categoryId),
        categoryName: body?.categoryId === WATER_ID ? 'Water' : 'Electricity',
        expectedAmountMkd: Number(body?.expectedAmountMkd),
        dueDay: Number(body?.dueDay),
        recurrence: body?.recurrence as Obl['recurrence'],
        everyNMonths: (body?.everyNMonths as number | undefined) ?? null,
        months: (body?.months as number[] | undefined) ?? null,
        startMonth: String(body?.startMonth),
        endMonth: (body?.endMonth as string | null | undefined) ?? null,
      };
      data.push(created);
      return reply(201, created);
    }
    const match = /^\/obligations\/([^/]+)$/.exec(path);
    if (match && method === 'PATCH') {
      const row = data.find((o) => o.id === match[1]);
      if (!row)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Obligation not found.' } });
      Object.assign(row, body);
      return reply(200, row);
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    failLoadsOnce: () => (failLoads = 1),
    holdNextPost: (gate: Promise<void>) => (holdPost = gate),
    failNextPost: (status: number, error: Record<string, unknown>) =>
      (failPost = { status, error }),
    paths: () =>
      calls.filter((c) => c.path !== '/auth/refresh').map((c) => `${c.method} ${c.path}`),
    posts: () => calls.filter((c) => c.method === 'POST' && c.path === '/obligations'),
    patches: () => calls.filter((c) => c.method === 'PATCH'),
  };
}

function renderPage(path = '/obligations') {
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

async function loaded() {
  await screen.findByRole('heading', { name: 'Recurring bills' });
}

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add a recurring bill' }));
}

async function fillBasics(
  user: ReturnType<typeof userEvent.setup>,
  { name = 'Water', amount = '1200', day = '10', category = 'Water' } = {},
) {
  await user.type(screen.getByLabelText('Name'), name);
  await user.click(screen.getByLabelText(category));
  await user.type(screen.getByLabelText(/Usual amount/), amount);
  await user.type(screen.getByLabelText(/Due day/), day);
}

describe('ObligationsPage: showing', () => {
  it("creates this month's bills first, then shows them next to the recurring bills", async () => {
    const api = fakeApi();
    renderPage();
    await loaded();

    const order = api.paths();
    expect(order.indexOf(`POST /bills/generate?month=${MONTH}`)).toBeGreaterThan(-1);
    expect(order.indexOf(`POST /bills/generate?month=${MONTH}`)).toBeLessThan(
      order.indexOf(`GET /bills?month=${MONTH}`),
    );

    const bills = screen.getByRole('region', { name: /Bills in/ });
    expect(within(bills).getByText('Electricity')).toBeTruthy();
    expect(within(bills).getByText(/Due .* 15 · EVN/)).toBeTruthy();
    expect(within(bills).getByText(/Expected in total/).textContent).toContain('4,500');
    expect(
      screen.getByText(/Every month · due on the 15th · from January 2026 · ongoing/),
    ).toBeTruthy();
  });

  it('shows friendly empty states', async () => {
    fakeApi([]);
    renderPage();
    await loaded();
    expect(screen.getByText('No bills due this month.')).toBeTruthy();
    expect(screen.getByText(/No recurring bills yet/)).toBeTruthy();
  });

  it('shows an error with a way to try again', async () => {
    const api = fakeApi();
    api.failLoadsOnce();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load your bills.');
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(screen.getAllByText('Electricity').length).toBeGreaterThan(0);
  });

  it('is reachable from the home screen', async () => {
    fakeApi();
    const router = renderPage('/');
    const link = await screen.findByRole('link', { name: 'Bills' });
    await userEvent.setup().click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/obligations'));
  });
});

describe('ObligationsPage: adding', () => {
  it('saves a monthly bill and then shows its bill for this month', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await fillBasics(user, { name: 'Water', amount: '1200', day: '10' });
    await user.type(screen.getByLabelText(/Who is paid/), 'Vodovod');
    await user.click(screen.getByRole('button', { name: 'Save bill' }));

    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({
      recurrence: 'monthly',
      name: 'Water',
      payee: 'Vodovod',
      categoryId: WATER_ID,
      expectedAmountMkd: 1_200,
      dueDay: 10,
      endMonth: null,
    });
    expect(api.posts()[0]!.body).not.toHaveProperty('everyNMonths');
    expect(api.posts()[0]!.body).not.toHaveProperty('months');
    const bills = await screen.findByRole('region', { name: /Bills in/ });
    await waitFor(() => expect(within(bills).getByText('Water')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Save bill' })).toBeNull();
  });

  it('saves a bill every few months with the chosen number', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByLabelText('Every few months'));
    await fillBasics(user, {
      name: 'Insurance',
      amount: '9000',
      day: '1',
      category: 'Electricity',
    });
    await user.selectOptions(screen.getByLabelText('Every how many months'), '6');
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({ recurrence: 'every_n_months', everyNMonths: 6 });
    expect(api.posts()[0]!.body).not.toHaveProperty('months');
  });

  it('saves a bill in chosen months, in calendar order', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByLabelText('Chosen months'));
    await fillBasics(user, { name: 'Heating', amount: '3000', day: '20' });
    for (const month of ['Dec', 'Jan', 'Nov']) await user.click(screen.getByLabelText(month));
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({
      recurrence: 'custom_months',
      months: [1, 11, 12],
    });
    expect(api.posts()[0]!.body).not.toHaveProperty('everyNMonths');
  });

  it('asks for at least one month when months are chosen', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByLabelText('Chosen months'));
    await fillBasics(user, { name: 'Heating', amount: '3000', day: '20' });
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findByText('Choose at least one month')).toBeTruthy();
    expect(api.posts()).toHaveLength(0);
  });

  it('shows what is missing and sends nothing', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findByText('Enter a name')).toBeTruthy();
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.getByText('Choose the day of the month')).toBeTruthy();
    expect(api.posts()).toHaveLength(0);
  });

  it('explains a mistyped amount', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await fillBasics(user, { amount: '12.5' });
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(api.posts()).toHaveLength(0);
  });

  it("shows the server's message in the form and keeps what was typed", async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await fillBasics(user, { name: 'Water' });
    api.failNextPost(409, {
      code: 'CONFLICT',
      message: 'This category is archived. Pick another one.',
    });
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findByText('This category is archived. Pick another one.')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Water');
    expect((screen.getByRole('button', { name: 'Save bill' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('cancel closes the form without saving', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(api.posts()).toHaveLength(0);
  });
});

describe('ObligationsPage: editing', () => {
  it('sends only the fields of its recurrence and refreshes the bills', async () => {
    const api = fakeApi();
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Electricity/ }));
    const amount = screen.getByLabelText(/Usual amount/);
    await user.clear(amount);
    await user.type(amount, '5200');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.patches()).toHaveLength(1));
    const patch = api.patches()[0]!;
    expect(patch.path).toBe('/obligations/o1');
    expect(patch.body).toMatchObject({ expectedAmountMkd: 5_200, name: 'Electricity', dueDay: 15 });
    for (const field of ['recurrence', 'months', 'everyNMonths']) {
      expect(patch.body).not.toHaveProperty(field);
    }
    expect(await screen.findAllByText('5,200 MKD', { exact: false })).not.toHaveLength(0);
  });

  it('does not let the recurrence be changed', async () => {
    fakeApi();
    renderPage();
    await loaded();
    await userEvent.setup().click(screen.getByRole('button', { name: /Edit Electricity/ }));
    expect(screen.queryByLabelText('Every few months')).toBeNull();
    expect(screen.getByText('Every month', { selector: 'p' })).toBeTruthy();
  });

  it('locks adding while a bill is being edited, and unlocks after cancel', async () => {
    fakeApi();
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Electricity/ }));
    expect(
      (screen.getByRole('button', { name: 'Add a recurring bill' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      (screen.getByRole('button', { name: 'Add a recurring bill' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('locks editing while adding', async () => {
    fakeApi();
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    expect(
      (screen.getByRole('button', { name: /Edit Electricity/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

const insurance = (): Obl => ({
  ...electricity(),
  id: 'o2',
  name: 'Insurance',
  recurrence: 'every_n_months',
  everyNMonths: 3,
  dueDay: 20,
});

const heating = (): Obl => ({
  ...electricity(),
  id: 'o3',
  name: 'Heating',
  recurrence: 'custom_months',
  months: [1, 2, 11, 12],
  dueDay: 5,
});

describe('ObligationsPage: editing every kind', () => {
  it('clears the payee and takes the end month away', async () => {
    const api = fakeApi([{ ...electricity(), endMonth: '2026-12' }]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Electricity/ }));
    await user.clear(screen.getByLabelText(/Who is paid/));
    await user.clear(screen.getByLabelText(/Until month/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    expect(api.patches()[0]!.body).toMatchObject({ payee: null, endMonth: null });
  });

  it('sends the number of months for a bill every few months, and no month list', async () => {
    const api = fakeApi([insurance()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Insurance/ }));
    expect((screen.getByLabelText('Every how many months') as HTMLSelectElement).value).toBe('3');
    await user.selectOptions(screen.getByLabelText('Every how many months'), '4');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    expect(api.patches()[0]!.body).toMatchObject({ everyNMonths: 4 });
    expect(api.patches()[0]!.body).not.toHaveProperty('months');
  });

  it('sends the month list for a bill in chosen months, and no number', async () => {
    const api = fakeApi([heating()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Heating/ }));
    expect((screen.getByLabelText('Nov') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Jun') as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByLabelText('Nov'));
    await user.click(screen.getByLabelText('Mar'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    expect(api.patches()[0]!.body).toMatchObject({ months: [1, 2, 3, 12] });
    expect(api.patches()[0]!.body).not.toHaveProperty('everyNMonths');
  });
});

describe('ObligationsPage: form details', () => {
  it('a month ticked twice is unticked again', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await user.click(screen.getByLabelText('Chosen months'));
    await fillBasics(user, { name: 'Heating', amount: '3000', day: '20' });
    await user.click(screen.getByLabelText('Jan'));
    await user.click(screen.getByLabelText('Feb'));
    await user.click(screen.getByLabelText('Jan'));
    expect((screen.getByLabelText('Jan') as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({ months: [2] });
  });

  it('saves once even when the button is pressed twice quickly', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openAddForm(user);
    await fillBasics(user);
    let release!: () => void;
    api.holdNextPost(new Promise<void>((resolve) => (release = resolve)));
    const save = screen.getByRole('button', { name: 'Save bill' });
    await user.click(save);
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    // Any other way of submitting (such as the Enter key) must not save a second time either.
    fireEvent.submit(screen.getByRole('button', { name: 'Saving…' }).closest('form')!);
    release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(api.posts()).toHaveLength(1);
  });
});
