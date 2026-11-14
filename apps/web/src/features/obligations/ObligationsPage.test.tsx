import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

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
  kind?: 'bill' | 'loan' | 'installment';
  groupId?: string | null;
  installment?: {
    contractTotalMkd: number;
    firstInstallmentMkd: number;
    installmentCount: number;
    paidCount: number;
    paidMkd: number;
    remainingMkd: number;
    installmentsLeft: number;
  } | null;
  loan?: {
    loanType: string;
    principalMkd: number;
    annualRateBp: number;
    rateChanges: { effectiveMonth: string; annualRateBp: number; monthlyPaymentMkd: number }[];
    extraPayments: { id: string; paidOn: string; amountMkd: number; kind: 'extra' | 'payoff' }[];
  } | null;
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

function fakeApi(
  initial: Obl[] = [electricity()],
  initialGroups: { id: string; name: string }[] = [],
) {
  const data = [...initial];
  const groupRows = initialGroups.map((g) => ({ ...g }));
  const calls: Call[] = [];
  let failLoads = 0;
  let failPost: { status: number; error: Record<string, unknown> } | null = null;
  let holdPost: Promise<void> | null = null;
  const paidBills: Record<string, number> = {};

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

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
      return reply(200, {
        obligations: [...data].sort((a, b) => a.name.localeCompare(b.name)),
        groups: groupRows,
      });
    }
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
        groupId: (body?.groupId as string | undefined) ?? null,
      };
      data.push(created);
      return reply(201, created);
    }
    if (method === 'POST' && path === '/obligations/loans') {
      if (failPost) {
        const { status, error } = failPost;
        failPost = null;
        return reply(status, { error });
      }
      const created: Obl = {
        id: `o${data.length + 10}`,
        name: String(body?.name),
        payee: String(body?.lender),
        categoryId: String(body?.categoryId),
        categoryName: body?.categoryId === WATER_ID ? 'Water' : 'Electricity',
        expectedAmountMkd: Number(body?.monthlyPaymentMkd ?? 11_102),
        dueDay: Number(body?.dueDay),
        recurrence: 'monthly',
        everyNMonths: null,
        months: null,
        startMonth: String(body?.startMonth),
        endMonth: String(body?.endMonth),
        kind: 'loan',
        loan: {
          loanType: String(body?.loanType),
          principalMkd: Number(body?.principalMkd),
          annualRateBp: Number(body?.annualRateBp),
          rateChanges: [],
          extraPayments: [],
        },
      };
      data.push(created);
      return reply(201, created);
    }
    if (method === 'POST' && path === '/obligations/groups') {
      const name = String(body?.name);
      if (groupRows.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
        return reply(409, {
          error: {
            code: 'CONFLICT',
            message: 'You already have a group with this name.',
            details: { name: 'Already used' },
          },
        });
      }
      const created = { id: `g${groupRows.length + 10}`, name };
      groupRows.push(created);
      return reply(201, created);
    }
    const groupMatch = /^\/obligations\/groups\/([^/]+)$/.exec(path);
    if (groupMatch && method === 'PATCH') {
      const group = groupRows.find((g) => g.id === groupMatch[1]);
      if (!group) return reply(404, { error: { code: 'NOT_FOUND', message: 'Group not found.' } });
      group.name = String(body?.name);
      return reply(200, group);
    }
    if (groupMatch && method === 'DELETE') {
      const index = groupRows.findIndex((g) => g.id === groupMatch[1]);
      if (index < 0)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Group not found.' } });
      groupRows.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && path === '/obligations/installments') {
      const created: Obl = {
        id: `o${data.length + 10}`,
        name: String(body?.name),
        payee: (body?.payee as string | null | undefined) ?? null,
        categoryId: String(body?.categoryId),
        categoryName: body?.categoryId === WATER_ID ? 'Water' : 'Electricity',
        expectedAmountMkd: Number(body?.regularInstallmentMkd),
        dueDay: Number(body?.dueDay),
        recurrence: 'monthly',
        everyNMonths: null,
        months: null,
        startMonth: String(body?.startMonth),
        endMonth: '2027-11',
        kind: 'installment',
        installment: {
          contractTotalMkd: Number(body?.contractTotalMkd),
          firstInstallmentMkd: Number(body?.firstInstallmentMkd),
          installmentCount: 50,
          paidCount: 0,
          paidMkd: 0,
          remainingMkd: Number(body?.contractTotalMkd),
          installmentsLeft: 50,
        },
      };
      data.push(created);
      return reply(201, created);
    }
    const archiveMatch = /^\/obligations\/([^/]+)\/archive$/.exec(path);
    if (archiveMatch && method === 'POST') {
      const index = data.findIndex((o) => o.id === archiveMatch[1]);
      if (index < 0)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Obligation not found.' } });
      data.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    const extraMatch = /^\/obligations\/([^/]+)\/(extra-payments|payoff)$/.exec(path);
    if (extraMatch && method === 'POST') {
      const row = data.find((o) => o.id === extraMatch[1]);
      if (!row?.loan)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Obligation not found.' } });
      if (failPost) {
        const { status, error } = failPost;
        failPost = null;
        return reply(status, { error });
      }
      row.loan.extraPayments = [
        ...row.loan.extraPayments,
        {
          id: `x${row.loan.extraPayments.length + 1}`,
          paidOn: String(body?.paidOn),
          amountMkd: Number(body?.amountMkd),
          kind: extraMatch[2] === 'payoff' ? 'payoff' : 'extra',
        },
      ];
      return reply(201, row);
    }
    const rateMatch = /^\/obligations\/([^/]+)\/rate-changes$/.exec(path);
    if (rateMatch && method === 'POST') {
      const row = data.find((o) => o.id === rateMatch[1]);
      if (!row?.loan)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Obligation not found.' } });
      row.loan.rateChanges = [
        ...row.loan.rateChanges.filter((c) => c.effectiveMonth !== body?.effectiveMonth),
        {
          effectiveMonth: String(body?.effectiveMonth),
          annualRateBp: Number(body?.annualRateBp),
          monthlyPaymentMkd: Number(body?.monthlyPaymentMkd),
        },
      ];
      return reply(200, row);
    }
    const match = /^\/obligations\/([^/]+)$/.exec(path);
    if (match && method === 'DELETE') {
      const index = data.findIndex((o) => o.id === match[1]);
      if (index < 0)
        return reply(404, { error: { code: 'NOT_FOUND', message: 'Obligation not found.' } });
      const paid = paidBills[match[1]!] ?? 0;
      if (paid > 0) {
        return reply(409, {
          error: {
            code: 'CONFLICT',
            message: 'It has recorded payments.',
            details: { paidBills: String(paid) },
          },
        });
      }
      data.splice(index, 1);
      return new Response(null, { status: 204 });
    }
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
    setPaidBills: (id: string, count: number) => (paidBills[id] = count),
    removals: () => calls.filter((c) => c.method === 'DELETE' || c.path.endsWith('/archive')),
    paths: () =>
      calls.filter((c) => c.path !== '/auth/refresh').map((c) => `${c.method} ${c.path}`),
    posts: () => calls.filter((c) => c.method === 'POST' && c.path === '/obligations'),
    patches: () => calls.filter((c) => c.method === 'PATCH'),
    extraPosts: () =>
      calls.filter((c) => c.method === 'POST' && /\/(extra-payments|payoff)$/.test(c.path)),
    rateChangePosts: () =>
      calls.filter((c) => c.method === 'POST' && c.path.endsWith('/rate-changes')),
    groupCalls: () => calls.filter((c) => c.path.startsWith('/obligations/groups')),
    installmentPosts: () =>
      calls.filter((c) => c.method === 'POST' && c.path === '/obligations/installments'),
    loanPosts: () => calls.filter((c) => c.method === 'POST' && c.path === '/obligations/loans'),
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
  await screen.findByRole('button', { name: 'Add a recurring bill' });
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
  it('lists the recurring bills with how often they come, and does not touch the bills themselves', async () => {
    const api = fakeApi();
    renderPage();
    await loaded();
    expect(
      screen.getByText(/Every month · due on the 15th · from January 2026 · ongoing/),
    ).toBeTruthy();
    expect(api.paths().filter((p) => p.includes('/bills'))).toEqual([]);
    expect(screen.getByRole('link', { name: '← Bills' }).getAttribute('href')).toBe('/bills');
  });

  it('shows friendly empty states', async () => {
    fakeApi([]);
    renderPage();
    await loaded();
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
    await waitFor(() => expect(router.state.location.pathname).toBe('/bills'));
  });
});

describe('ObligationsPage: adding', () => {
  it('saves a monthly bill and then shows it in the list', async () => {
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
    await waitFor(() => expect(screen.getByText(/Every month · due on the 10th/)).toBeTruthy());
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

describe('ObligationsPage: loans', () => {
  async function openLoanForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Add a loan' }));
  }

  async function fillLoan(
    user: ReturnType<typeof userEvent.setup>,
    { principal = '1000000', rate = '6', end = '2035-12', payment = '' } = {},
  ) {
    await user.type(screen.getByLabelText('Name'), 'Mortgage');
    await user.type(screen.getByLabelText('Lender'), 'Komercijalna Banka');
    await user.click(screen.getByLabelText('Water'));
    await user.type(screen.getByLabelText(/Amount borrowed/), principal);
    await user.type(screen.getByLabelText(/Yearly interest/), rate);
    fireEvent.change(screen.getByLabelText(/First payment month/), {
      target: { value: '2026-01' },
    });
    fireEvent.change(screen.getByLabelText(/Last payment month/), { target: { value: end } });
    await user.type(screen.getByLabelText(/Due day/), '5');
    if (payment) await user.type(screen.getByLabelText(/Monthly payment/), payment);
  }

  it('saves a loan without a payment, shows the worked-out payment first, and lists it', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await fillLoan(user);
    expect(screen.getByText(/Worked out: 11,102 MKD a month/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save loan' }));

    await waitFor(() => expect(api.loanPosts()).toHaveLength(1));
    const body = api.loanPosts()[0]!.body!;
    expect(body).toMatchObject({
      name: 'Mortgage',
      lender: 'Komercijalna Banka',
      loanType: 'housing',
      principalMkd: 1_000_000,
      annualRateBp: 600,
      categoryId: WATER_ID,
      dueDay: 5,
      startMonth: '2026-01',
      endMonth: '2035-12',
    });
    expect(body).not.toHaveProperty('monthlyPaymentMkd');

    expect(await screen.findByText(/Home loan · 1,000,000 MKD borrowed · 6 % a year/)).toBeTruthy();
    expect(screen.getAllByText('11,102 MKD').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Rate change for Mortgage/ })).toBeTruthy();
  });

  it("sends the bank's payment when it is typed in, and updates the hint", async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await fillLoan(user, { payment: '19500' });
    expect(screen.getByText(/Payment: 19,500 MKD a month/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save loan' }));
    await waitFor(() => expect(api.loanPosts()).toHaveLength(1));
    expect(api.loanPosts()[0]!.body).toMatchObject({ monthlyPaymentMkd: 19_500 });
  });

  it('reads a comma as the decimal mark in the rate', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await fillLoan(user, { rate: '4,5' });
    await user.click(screen.getByRole('button', { name: 'Save loan' }));
    await waitFor(() => expect(api.loanPosts()).toHaveLength(1));
    expect(api.loanPosts()[0]!.body).toMatchObject({ annualRateBp: 450 });
  });

  it('shows what is wrong and sends nothing when the form is incomplete or mistyped', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await user.type(screen.getByLabelText(/Amount borrowed/), '12.5');
    await user.type(screen.getByLabelText(/Yearly interest/), '4.567');
    await user.click(screen.getByRole('button', { name: 'Save loan' }));

    expect(await screen.findByText('Enter whole denars, for example 1250')).toBeTruthy();
    expect(screen.getByText('Use at most two decimals, for example 4.5')).toBeTruthy();
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(screen.getByText('Enter the lender')).toBeTruthy();
    expect(screen.getByText('Choose a month')).toBeTruthy();
    expect(api.loanPosts()).toHaveLength(0);
  });

  it('refuses a last month before the first', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await fillLoan(user, { end: '2025-12' });
    await user.click(screen.getByRole('button', { name: 'Save loan' }));
    expect(await screen.findByText(/before/i)).toBeTruthy();
    expect(api.loanPosts()).toHaveLength(0);
  });

  it("shows the server's message and keeps the form when saving fails", async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await fillLoan(user);
    api.failNextPost(409, {
      code: 'CONFLICT',
      message: 'This category is archived. Pick another one.',
    });
    await user.click(screen.getByRole('button', { name: 'Save loan' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This category is archived.');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Mortgage');
  });

  it('closes the form on Cancel without saving, and offers both buttons again', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openLoanForm(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add a loan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a recurring bill' })).toBeTruthy();
    expect(api.loanPosts()).toHaveLength(0);
  });
});

describe('ObligationsPage: changing a loan', () => {
  const mortgage = (over: Partial<Obl> = {}): Obl => ({
    id: 'loan1',
    name: 'Mortgage',
    payee: 'Komercijalna Banka',
    categoryId: WATER_ID,
    categoryName: 'Water',
    expectedAmountMkd: 11_102,
    dueDay: 5,
    recurrence: 'monthly',
    everyNMonths: null,
    months: null,
    startMonth: '2026-01',
    endMonth: '2035-12',
    kind: 'loan',
    loan: {
      loanType: 'housing',
      principalMkd: 1_000_000,
      annualRateBp: 600,
      rateChanges: [],
      extraPayments: [],
    },
    ...over,
  });

  it('records a rate change with the typed payment and shows it on the loan', async () => {
    const api = fakeApi([mortgage()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Rate change for Mortgage/ }));
    fireEvent.change(screen.getByLabelText(/New terms start in/), { target: { value: '2027-03' } });
    await user.type(screen.getByLabelText(/New yearly interest/), '7,5');
    await user.type(screen.getByLabelText(/New monthly payment/), '12400');
    await user.click(screen.getByRole('button', { name: 'Save rate change' }));

    await waitFor(() => expect(api.rateChangePosts()).toHaveLength(1));
    expect(api.rateChangePosts()[0]!.path).toBe('/obligations/loan1/rate-changes');
    expect(api.rateChangePosts()[0]!.body).toEqual({
      effectiveMonth: '2027-03',
      annualRateBp: 750,
      monthlyPaymentMkd: 12_400,
    });
    expect(await screen.findByText(/From 2027-03: 7.5 %, 12,400 MKD a month/)).toBeTruthy();
  });

  it('suggests a payment as a hint only, and does not fill the box', async () => {
    fakeApi([mortgage()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Rate change for Mortgage/ }));
    fireEvent.change(screen.getByLabelText(/New terms start in/), { target: { value: '2030-01' } });
    await user.type(screen.getByLabelText(/New yearly interest/), '6');
    expect(screen.getByText(/For reference, .* about 11,1\d\d MKD/)).toBeTruthy();
    expect((screen.getByLabelText(/New monthly payment/) as HTMLInputElement).value).toBe('');
  });

  it('asks for the payment and sends nothing without it', async () => {
    const api = fakeApi([mortgage()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Rate change for Mortgage/ }));
    await user.type(screen.getByLabelText(/New yearly interest/), '7');
    await user.click(screen.getByRole('button', { name: 'Save rate change' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(api.rateChangePosts()).toHaveLength(0);
  });

  it('shows the payment in force now on the loan row', async () => {
    fakeApi([
      mortgage({
        loan: {
          loanType: 'housing',
          principalMkd: 1_000_000,
          annualRateBp: 600,
          rateChanges: [
            { effectiveMonth: '2026-01', annualRateBp: 700, monthlyPaymentMkd: 12_000 },
          ],
          extraPayments: [],
        },
      }),
    ]);
    renderPage();
    await loaded();
    expect(screen.getAllByText('12,000 MKD').length).toBeGreaterThan(0);
  });

  it('edits the loan without sending the payment or the rate', async () => {
    const api = fakeApi([mortgage()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit Mortgage/ }));
    expect(screen.queryByLabelText(/Monthly payment/)).toBeNull();
    expect(screen.queryByLabelText(/Yearly interest/)).toBeNull();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Home loan');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.patches()).toHaveLength(1));
    const body = api.patches()[0]!.body!;
    expect(api.patches()[0]!.path).toBe('/obligations/loan1');
    expect(body).toMatchObject({
      name: 'Home loan',
      payee: 'Komercijalna Banka',
      loanType: 'housing',
      principalMkd: 1_000_000,
      endMonth: '2035-12',
    });
    expect(body).not.toHaveProperty('expectedAmountMkd');
    expect(body).not.toHaveProperty('annualRateBp');
    expect(body).not.toHaveProperty('monthlyPaymentMkd');
  });
});

describe('ObligationsPage: removing', () => {
  const water = (): Obl => ({
    id: 'w1',
    name: 'Water',
    payee: 'Vodovod',
    categoryId: WATER_ID,
    categoryName: 'Water',
    expectedAmountMkd: 1_200,
    dueDay: 10,
    recurrence: 'monthly',
    everyNMonths: null,
    months: null,
    startMonth: '2026-01',
    endMonth: null,
  });

  it('asks first, then deletes one without payments and drops it from the list', async () => {
    const api = fakeApi([water()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Water' }));
    expect(api.removals()).toHaveLength(0);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete Water' }),
    );
    await waitFor(() => expect(api.removals()).toHaveLength(1));
    expect(api.removals()[0]).toMatchObject({ method: 'DELETE', path: '/obligations/w1' });
    await waitFor(() => expect(screen.queryByText('Water')).toBeNull());
  });

  it('says how many payments it has and archives instead', async () => {
    const api = fakeApi([water()]);
    api.setPaidBills('w1', 3);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Water' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete Water' }),
    );
    expect(await screen.findByText(/has 3 recorded payments/)).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Archive Water' }));
    await waitFor(() =>
      expect(api.removals().map((c) => `${c.method} ${c.path}`)).toEqual([
        'DELETE /obligations/w1',
        'POST /obligations/w1/archive',
      ]),
    );
    await waitFor(() => expect(screen.queryByText('Water')).toBeNull());
  });

  it('cancelling changes nothing', async () => {
    const api = fakeApi([water()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Water' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.removals()).toHaveLength(0);
    expect(screen.getByText('Water')).toBeTruthy();
  });
});

describe('ObligationsPage: extra payment and payoff', () => {
  const loanRow = (): Obl => ({
    id: 'loan1',
    name: 'Mortgage',
    payee: 'Bank',
    categoryId: WATER_ID,
    categoryName: 'Water',
    expectedAmountMkd: 10_000,
    dueDay: 5,
    recurrence: 'monthly',
    everyNMonths: null,
    months: null,
    startMonth: '2026-01',
    endMonth: '2035-12',
    kind: 'loan',
    loan: {
      loanType: 'housing',
      principalMkd: 1_000_000,
      annualRateBp: 600,
      rateChanges: [],
      extraPayments: [],
    },
  });

  async function openExtra(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Extra payment on Mortgage' }));
  }

  it('saves an extra payment with the chosen effect and lists it', async () => {
    const api = fakeApi([loanRow()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openExtra(user);
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-05-10' } });
    await user.type(screen.getByLabelText(/Extra amount/), '20000');
    await user.click(screen.getByLabelText('Keep the payment, end the loan earlier'));
    await user.click(screen.getByRole('button', { name: 'Save extra payment' }));
    await waitFor(() => expect(api.extraPosts()).toHaveLength(1));
    expect(api.extraPosts()[0]!.path).toBe('/obligations/loan1/extra-payments');
    expect(api.extraPosts()[0]!.body).toEqual({
      paidOn: '2026-05-10',
      amountMkd: 20_000,
      effect: 'shorten',
    });
    expect(await screen.findByText('Extra 20,000 MKD on 2026-05-10')).toBeTruthy();
  });

  it('asks for the new payment only when the payment is to be lowered', async () => {
    const api = fakeApi([loanRow()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openExtra(user);
    expect(screen.queryByLabelText(/New monthly payment/)).toBeNull();
    await user.click(screen.getByLabelText('Lower the payment, keep the end date'));
    await user.type(screen.getByLabelText(/Extra amount/), '20000');
    await user.click(screen.getByRole('button', { name: 'Save extra payment' }));
    expect(await screen.findByText('Enter the new monthly payment')).toBeTruthy();
    expect(api.extraPosts()).toHaveLength(0);
    await user.type(screen.getByLabelText(/New monthly payment/), '9000');
    await user.click(screen.getByRole('button', { name: 'Save extra payment' }));
    await waitFor(() => expect(api.extraPosts()).toHaveLength(1));
    expect(api.extraPosts()[0]!.body).toMatchObject({
      effect: 'lower_payment',
      newMonthlyPaymentMkd: 9_000,
    });
  });

  it("shows the server's message when the extra payment is refused", async () => {
    const api = fakeApi([loanRow()]);
    api.failNextPost(400, {
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { amountMkd: 'That pays off the whole loan. Use Pay off instead.' },
    });
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await openExtra(user);
    await user.type(screen.getByLabelText(/Extra amount/), '999999');
    await user.click(screen.getByRole('button', { name: 'Save extra payment' }));
    expect(await screen.findByText(/Use Pay off instead/)).toBeTruthy();
  });

  it('pays off a loan, shows it as paid off and takes the loan actions away', async () => {
    const api = fakeApi([loanRow()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay off Mortgage' }));
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-11-05' } });
    await user.type(screen.getByLabelText(/Payoff amount/), '950000');
    await user.click(screen.getByRole('button', { name: 'Pay off loan' }));
    await waitFor(() => expect(api.extraPosts()).toHaveLength(1));
    expect(api.extraPosts()[0]!.path).toBe('/obligations/loan1/payoff');
    expect(api.extraPosts()[0]!.body).toEqual({ paidOn: '2026-11-05', amountMkd: 950_000 });
    expect(await screen.findByText('Paid off on 2026-11-05 with 950,000 MKD')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pay off Mortgage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Extra payment on Mortgage' })).toBeNull();
  });

  it('sends nothing without an amount', async () => {
    const api = fakeApi([loanRow()]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pay off Mortgage' }));
    await user.click(screen.getByRole('button', { name: 'Pay off loan' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(api.extraPosts()).toHaveLength(0);
  });
});

describe('ObligationsPage: installment plans', () => {
  const kirbyRow = (): Obl => ({
    id: 'k1',
    name: 'Kirby',
    payee: 'Kirby',
    categoryId: WATER_ID,
    categoryName: 'Water',
    expectedAmountMkd: 3_075,
    dueDay: 30,
    recurrence: 'monthly',
    everyNMonths: null,
    months: null,
    startMonth: '2023-10',
    endMonth: '2027-11',
    kind: 'installment',
    installment: {
      contractTotalMkd: 153_750,
      firstInstallmentMkd: 5_500,
      installmentCount: 50,
      paidCount: 28,
      paidMkd: 88_525,
      remainingMkd: 65_225,
      installmentsLeft: 22,
    },
  });

  it('shows the plan, the amount left and the installments left, without an Edit button', async () => {
    fakeApi([kirbyRow()]);
    renderPage();
    await loaded();
    expect(
      screen.getByText('Contract 153,750 MKD · 50 installments, first 5,500 MKD'),
    ).toBeTruthy();
    expect(screen.getByText('Paid 28 of 50 · 65,225 MKD left · 22 installments left')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Kirby' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit Kirby/ })).toBeNull();
  });

  it('adds a plan, previews its length and lists it', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add an installment plan' }));
    await user.type(screen.getByLabelText('Name'), 'Kirby');
    await user.click(screen.getByLabelText('Water'));
    await user.type(screen.getByLabelText(/Contract total/), '153750');
    await user.type(screen.getByLabelText(/First installment \(MKD\)/), '5500');
    await user.type(screen.getByLabelText(/Regular installment/), '3075');
    fireEvent.change(screen.getByLabelText(/First installment month/), {
      target: { value: '2023-10' },
    });
    await user.type(screen.getByLabelText(/Due day/), '30');
    expect(
      screen.getByText('50 installments, the last one 650 MKD, until November 2027'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save installment plan' }));

    await waitFor(() => expect(api.installmentPosts()).toHaveLength(1));
    expect(api.installmentPosts()[0]!.body).toMatchObject({
      name: 'Kirby',
      categoryId: WATER_ID,
      dueDay: 30,
      startMonth: '2023-10',
      contractTotalMkd: 153_750,
      firstInstallmentMkd: 5_500,
      regularInstallmentMkd: 3_075,
    });
    expect(await screen.findByText(/Contract 153,750 MKD · 50 installments/)).toBeTruthy();
  });

  it('asks for what is missing and saves nothing', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add an installment plan' }));
    await user.click(screen.getByRole('button', { name: 'Save installment plan' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(api.installmentPosts()).toHaveLength(0);
  });
});

describe('ObligationsPage: groups', () => {
  const line = (over: Partial<Obl>): Obl => ({ ...electricity(), ...over });
  const streaming = { id: 'g1', name: 'Streaming' };

  it('shows a group with its lines apart from stand-alone bills', async () => {
    fakeApi(
      [
        line({ id: 'n1', name: 'Netflix', expectedAmountMkd: 600, groupId: 'g1' }),
        line({ id: 'd1', name: 'Disney', expectedAmountMkd: 300, groupId: 'g1' }),
        line({ id: 'w1', name: 'Water', groupId: null }),
      ],
      [streaming],
    );
    renderPage();
    await loaded();
    const group = within(screen.getByRole('region', { name: 'Group Streaming' }));
    expect(group.getByText('2 lines · every month 900 MKD')).toBeTruthy();
    expect(group.getByText('Netflix')).toBeTruthy();
    expect(group.getByText('Disney')).toBeTruthy();
    expect(group.queryByText('Water')).toBeNull();
    expect(screen.getByText('Water')).toBeTruthy();
  });

  it('adds a group', async () => {
    const api = fakeApi([]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add a group/ }));
    await user.type(screen.getByLabelText('Group name'), 'Streaming');
    await user.click(screen.getByRole('button', { name: 'Save group' }));
    expect(await screen.findByRole('region', { name: 'Group Streaming' })).toBeTruthy();
    expect(api.groupCalls()[0]!.body).toEqual({ name: 'Streaming' });
    expect(screen.getByText('No lines yet. Add Netflix, fuel and the like.')).toBeTruthy();
  });

  it("shows the server's message for a name already used", async () => {
    fakeApi([], [streaming]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add a group/ }));
    await user.type(screen.getByLabelText('Group name'), 'streaming');
    await user.click(screen.getByRole('button', { name: 'Save group' }));
    expect(await screen.findByText('Already used')).toBeTruthy();
  });

  it('adds a line to a group with its own amount and the group id', async () => {
    const api = fakeApi([], [streaming]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a line to Streaming' }));
    await user.type(screen.getByLabelText('Name'), 'Netflix');
    await user.click(screen.getByLabelText('Water'));
    await user.type(screen.getByLabelText(/Usual amount/), '600');
    await user.type(screen.getByLabelText(/Due day/), '5');
    await user.click(screen.getByRole('button', { name: 'Save line' }));
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({ name: 'Netflix', groupId: 'g1' });
    expect(
      within(await screen.findByRole('region', { name: 'Group Streaming' })).getByText('Netflix'),
    ).toBeTruthy();
  });

  it('renames a group and deletes it only while it has no lines', async () => {
    const api = fakeApi([line({ id: 'n1', name: 'Netflix', groupId: 'g1' })], [streaming]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Delete group Streaming' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Rename Streaming' }));
    const box = screen.getByLabelText('Group name');
    await user.clear(box);
    await user.type(box, 'TV');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('region', { name: 'Group TV' })).toBeTruthy();
    expect(api.groupCalls()[0]).toMatchObject({ method: 'PATCH', body: { name: 'TV' } });
  });

  it('deletes an empty group', async () => {
    const api = fakeApi([], [streaming]);
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete group Streaming' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Group Streaming' })).toBeNull(),
    );
    expect(api.groupCalls()[0]!.method).toBe('DELETE');
  });
});
