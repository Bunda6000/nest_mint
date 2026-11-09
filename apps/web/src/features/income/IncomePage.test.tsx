import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

interface Inc {
  id: string;
  name: string;
  amountMkd: number;
  recurrence: 'monthly' | 'one_off';
  receivedOn: string | null;
  startMonth: string | null;
  endMonth: string | null;
  payDay: number | null;
}

const rows = (): Inc[] => [
  {
    id: 'i1',
    name: 'Salary',
    amountMkd: 120_000,
    recurrence: 'monthly',
    receivedOn: null,
    startMonth: '2026-01',
    endMonth: null,
    payDay: 25,
  },
  {
    id: 'i2',
    name: 'Bonus',
    amountMkd: 30_000,
    recurrence: 'one_off',
    receivedOn: '2026-11-03',
    startMonth: null,
    endMonth: null,
    payDay: null,
  },
  {
    id: 'i3',
    name: 'Old job',
    amountMkd: 90_000,
    recurrence: 'monthly',
    receivedOn: null,
    startMonth: '2024-03',
    endMonth: '2025-12',
    payDay: 10,
  },
];

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}
type Failure = { status: number; error: Record<string, unknown> };

const sortKey = (i: Inc) => (i.recurrence === 'monthly' ? `${i.startMonth}-01` : i.receivedOn!);

function fakeApi(initial: Inc[] = rows()) {
  const data = [...initial];
  const calls: Call[] = [];
  let failList = 0;
  let failPost: Failure | null = null;
  let failPatch: Failure | null = null;
  let failDelete: Failure | null = null;
  let expirePost = false;
  let holdPost: Promise<void> | null = null;
  let refreshes = 0;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const error = (status: number, code: string, message: string) =>
    reply(status, { error: { code, message } });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, path, ...(body ? { body } : {}) });

    if (path === '/auth/refresh') {
      refreshes += 1;
      return reply(200, { ...session, accessToken: `token-${refreshes}` });
    }
    if (method === 'GET' && path === '/income') {
      if (failList > 0) {
        failList -= 1;
        return error(500, 'INTERNAL_ERROR', 'Something went wrong.');
      }
      return reply(200, {
        incomes: [...data].sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
      });
    }
    if (method === 'POST' && path === '/income') {
      if (holdPost) {
        const gate = holdPost;
        holdPost = null;
        await gate;
      }
      if (expirePost) {
        expirePost = false;
        return error(401, 'UNAUTHORIZED', 'Please log in.');
      }
      if (failPost) {
        const { status, error: failure } = failPost;
        failPost = null;
        return reply(status, { error: failure });
      }
      const created: Inc = {
        id: `i${data.length + 10}`,
        name: String(body?.name),
        amountMkd: Number(body?.amountMkd),
        recurrence: body?.recurrence as Inc['recurrence'],
        receivedOn: (body?.receivedOn as string | undefined) ?? null,
        startMonth: (body?.startMonth as string | undefined) ?? null,
        endMonth: (body?.endMonth as string | null | undefined) ?? null,
        payDay: (body?.payDay as number | undefined) ?? null,
      };
      data.push(created);
      return reply(201, created);
    }
    const match = /^\/income\/([^/]+)$/.exec(path);
    if (match && method === 'PATCH') {
      if (failPatch) {
        const { status, error: failure } = failPatch;
        failPatch = null;
        return reply(status, { error: failure });
      }
      const row = data.find((i) => i.id === match[1]);
      if (!row) return error(404, 'NOT_FOUND', 'Income not found.');
      Object.assign(row, body);
      return reply(200, row);
    }
    if (match && method === 'DELETE') {
      if (failDelete) {
        const { status, error: failure } = failDelete;
        failDelete = null;
        return reply(status, { error: failure });
      }
      const index = data.findIndex((i) => i.id === match[1]);
      if (index < 0) return error(404, 'NOT_FOUND', 'Income not found.');
      data.splice(index, 1);
      return reply(204);
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    data,
    calls,
    sent: (method: string) =>
      calls.filter((c) => c.method === method && c.path.startsWith('/income')),
    failListOnce: () => (failList = 1),
    failPostWith: (status: number, failure: Record<string, unknown>) =>
      (failPost = { status, error: failure }),
    failPatchWith: (status: number, failure: Record<string, unknown>) =>
      (failPatch = { status, error: failure }),
    failDeleteWith: (status: number, failure: Record<string, unknown>) =>
      (failDelete = { status, error: failure }),
    expireLoginOnPost: () => (expirePost = true),
    holdNextPost: () => {
      let release!: () => void;
      holdPost = new Promise<void>((resolve) => (release = resolve));
      return release;
    },
    removeBehindTheScenes: (id: string) => {
      const index = data.findIndex((i) => i.id === id);
      if (index >= 0) data.splice(index, 1);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 12, 0, 0)); // 8 Nov 2026, local time
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(initial: Inc[] = rows(), path = '/income') {
  const api = fakeApi(initial);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { api, router, user: userEvent.setup() };
}

const items = () => screen.getAllByRole('listitem');
const rowOf = (text: string) => items().find((li) => li.textContent?.includes(text))!;
const button = (name: RegExp | string) => screen.getByRole('button', { name });
const nameBox = () => screen.getByLabelText('Name') as HTMLInputElement;
const amountBox = () => screen.getByLabelText('Amount (MKD)') as HTMLInputElement;
const payDayBox = () => screen.getByLabelText('Pay day (1–31)') as HTMLInputElement;
const fromBox = () => screen.getByLabelText('From month') as HTMLInputElement;
const untilBox = () => screen.getByLabelText('Until month (optional)') as HTMLInputElement;
const dateBox = () => screen.getByLabelText('Date received') as HTMLInputElement;
const typeRadio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

async function ready() {
  await screen.findByRole('heading', { name: 'Income' });
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
}

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button('Add income'));
  await screen.findByText('Save income');
}

describe('the list', () => {
  it('shows monthly and one-off income, newest start first, with euros', async () => {
    setup();
    await ready();

    expect(items().map((li) => li.textContent)).toEqual([
      expect.stringContaining('Bonus'),
      expect.stringContaining('Salary'),
      expect.stringContaining('Old job'),
    ]);
    const salary = rowOf('Salary');
    expect(within(salary).getByText('120,000 MKD')).toBeTruthy();
    expect(within(salary).getByText('€1,951.22')).toBeTruthy();
    expect(
      within(salary).getByText('Every month on the 25th · from January 2026 · ongoing'),
    ).toBeTruthy();
    expect(within(rowOf('Bonus')).getByText('One-off · Nov 3, 2026')).toBeTruthy();
    expect(within(rowOf('Bonus')).getByText('€487.80')).toBeTruthy();
    expect(
      within(rowOf('Old job')).getByText(
        'Every month on the 10th · from March 2024 · until December 2025',
      ),
    ).toBeTruthy();
  });

  it('invites you to add your salary when there is nothing yet', async () => {
    setup([]);
    await ready();
    expect(screen.getByText('No income yet. Add your salary to get started.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const api = fakeApi();
    api.failListOnce();
    const router = createMemoryRouter(routes, { initialEntries: ['/income'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your income.');
    await user.click(button('Try again'));
    await waitFor(() => expect(items()).toHaveLength(3));
  });
});

describe('adding a monthly salary', () => {
  it('starts with the monthly type, this month, and nothing else filled in', async () => {
    const { user } = setup([]);
    await ready();
    await openAdd(user);

    expect(typeRadio('Monthly salary').checked).toBe(true);
    expect(typeRadio('One-off income').checked).toBe(false);
    expect(fromBox().value).toBe('2026-11');
    expect(untilBox().value).toBe('');
    expect(nameBox().value).toBe('');
    expect(payDayBox().value).toBe('');
    expect(document.activeElement).toBe(nameBox());
  });

  it('saves it, closes the form and shows it in the list', async () => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), '  Salary ');
    await user.type(amountBox(), '120,000');
    await user.type(payDayBox(), '25');
    fireEvent.change(fromBox(), { target: { value: '2026-01' } });
    await user.click(button('Save income'));

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByText('Save income')).toBeNull();
    expect(api.sent('POST')).toEqual([
      {
        method: 'POST',
        path: '/income',
        body: {
          recurrence: 'monthly',
          name: 'Salary',
          amountMkd: 120_000,
          startMonth: '2026-01',
          endMonth: null,
          payDay: 25,
        },
      },
    ]);
    expect(within(items()[0]!).getByText('Salary')).toBeTruthy();
  });

  it('sends an end month when one is chosen', async () => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), 'Contract');
    await user.type(amountBox(), '50000');
    await user.type(payDayBox(), '5');
    fireEvent.change(untilBox(), { target: { value: '2027-03' } });
    await user.click(button('Save income'));

    await waitFor(() => expect(api.sent('POST')).toHaveLength(1));
    expect(api.sent('POST')[0]!.body).toMatchObject({ startMonth: '2026-11', endMonth: '2027-03' });
  });

  it('shows a live euro estimate', async () => {
    const { user } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(amountBox(), '1230');
    expect(screen.getByText('≈ €20.00')).toBeTruthy();
    await user.clear(amountBox());
    await user.type(amountBox(), '12.5');
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});

describe('adding one-off income', () => {
  it('shows a date instead of the monthly fields, and saves it', async () => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.click(typeRadio('One-off income'));

    expect(dateBox().value).toBe('2026-11-08');
    expect(screen.queryByLabelText('Pay day (1–31)')).toBeNull();
    expect(screen.queryByLabelText('From month')).toBeNull();

    await user.type(nameBox(), 'Bonus');
    await user.type(amountBox(), '30000');
    fireEvent.change(dateBox(), { target: { value: '2026-11-03' } });
    await user.click(button('Save income'));

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(api.sent('POST')[0]!.body).toEqual({
      recurrence: 'one_off',
      name: 'Bonus',
      amountMkd: 30_000,
      receivedOn: '2026-11-03',
    });
  });

  it('keeps name and amount when switching type, and forgets old error messages', async () => {
    const { user } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), 'Thing');
    await user.type(amountBox(), '700');
    await user.click(button('Save income'));
    expect(screen.getByText('Choose the day of the month')).toBeTruthy();

    await user.click(typeRadio('One-off income'));
    expect(nameBox().value).toBe('Thing');
    expect(amountBox().value).toBe('700');

    // Back to monthly: the old message must not come back.
    await user.click(typeRadio('Monthly salary'));
    expect(screen.queryByText('Choose the day of the month')).toBeNull();
  });
});

describe('checking before sending', () => {
  it('asks for everything that is missing, and sends nothing', async () => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.click(button('Save income'));

    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(screen.getByText('Enter an amount')).toBeTruthy();
    expect(screen.getByText('Choose the day of the month')).toBeTruthy();
    expect(api.sent('POST')).toEqual([]);
  });

  it.each([
    ['0', 'Enter an amount above 0'],
    ['12.5', 'Enter whole denars, for example 1250'],
    ['abc', 'Use digits only, for example 1250'],
    ['100000001', 'Amount must be at most 100,000,000'],
  ])('refuses an amount of %j', async (typed, message) => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), 'Salary');
    await user.type(amountBox(), typed);
    await user.type(payDayBox(), '5');
    await user.click(button('Save income'));

    expect(screen.getByText(message)).toBeTruthy();
    expect(api.sent('POST')).toEqual([]);
  });

  it.each(['0', '32', 'x', '2.5'])('refuses a pay day of %j', async (typed) => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), 'Salary');
    await user.type(amountBox(), '100');
    await user.type(payDayBox(), typed);
    await user.click(button('Save income'));

    expect(api.sent('POST')).toEqual([]);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('refuses an end month before the start month', async () => {
    const { user, api } = setup([]);
    await ready();
    await openAdd(user);
    await user.type(nameBox(), 'Salary');
    await user.type(amountBox(), '100');
    await user.type(payDayBox(), '5');
    fireEvent.change(untilBox(), { target: { value: '2026-01' } });
    await user.click(button('Save income'));

    expect(screen.getByText('End month cannot be before the start month')).toBeTruthy();
    expect(api.sent('POST')).toEqual([]);
  });

  it('refuses a name that is too long', async () => {
    const { user } = setup([]);
    await ready();
    await openAdd(user);
    // The box itself stops typing at 60 characters.
    await user.type(nameBox(), 'x'.repeat(80));
    expect(nameBox().value).toHaveLength(60);
  });
});

describe('when saving does not work', () => {
  async function fillSalary(user: ReturnType<typeof userEvent.setup>) {
    await openAdd(user);
    await user.type(nameBox(), 'Salary');
    await user.type(amountBox(), '120000');
    await user.type(payDayBox(), '25');
  }

  it("shows the server's field message and keeps what was typed", async () => {
    const { user, api } = setup([]);
    await ready();
    await fillSalary(user);
    api.failPostWith(400, {
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { startMonth: 'Choose a valid month' },
    });
    await user.click(button('Save income'));

    expect(await screen.findByText('Choose a valid month')).toBeTruthy();
    expect(screen.getByText('Some fields are invalid.')).toBeTruthy();
    expect(nameBox().value).toBe('Salary');
    expect(amountBox().value).toBe('120000');
  });

  it('shows a general message for an unexpected failure and allows trying again', async () => {
    const { user, api } = setup([]);
    await ready();
    await fillSalary(user);
    api.failPostWith(500, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    await user.click(button('Save income'));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();

    await user.click(button('Save income'));
    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it('sends only one request when Save is pressed twice quickly', async () => {
    const { user, api } = setup([]);
    await ready();
    await fillSalary(user);
    const release = api.holdNextPost();
    await user.click(button('Save income'));
    const saving = button('Saving…') as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    await user.click(saving);
    release();

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(api.sent('POST')).toHaveLength(1);
  });

  it('renews an expired login and saves once', async () => {
    const { user, api } = setup([]);
    await ready();
    await fillSalary(user);
    api.expireLoginOnPost();
    await user.click(button('Save income'));

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(api.sent('POST')).toHaveLength(2); // refused once, then accepted with the new token
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be cancelled without saving', async () => {
    const { user, api } = setup([]);
    await ready();
    await fillSalary(user);
    await user.click(button('Cancel'));

    expect(screen.queryByText('Save income')).toBeNull();
    expect(api.sent('POST')).toEqual([]);
    expect(button('Add income')).toBeTruthy();
  });
});

describe('editing', () => {
  it('opens a salary with its values filled in and no type to choose', async () => {
    const { user } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));

    expect(screen.getByText('Edit income')).toBeTruthy();
    expect(screen.getByText('Monthly salary')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(nameBox().value).toBe('Salary');
    expect(amountBox().value).toBe('120000');
    expect(payDayBox().value).toBe('25');
    expect(fromBox().value).toBe('2026-01');
    expect(untilBox().value).toBe('');
  });

  it('saves a new amount, sending only the monthly fields', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));
    await user.clear(amountBox());
    await user.type(amountBox(), '130000');
    await user.click(button('Save changes'));

    await waitFor(() => expect(within(rowOf('Salary')).getByText('130,000 MKD')).toBeTruthy());
    expect(screen.queryByText('Edit income')).toBeNull();
    expect(api.sent('PATCH')).toEqual([
      {
        method: 'PATCH',
        path: '/income/i1',
        body: {
          name: 'Salary',
          amountMkd: 130_000,
          startMonth: '2026-01',
          endMonth: null,
          payDay: 25,
        },
      },
    ]);
  });

  it('ends a salary by setting the last month, and takes the end away again', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));
    fireEvent.change(untilBox(), { target: { value: '2026-12' } });
    await user.click(button('Save changes'));
    await waitFor(() =>
      expect(within(rowOf('Salary')).getByText(/until December 2026/)).toBeTruthy(),
    );
    expect(api.sent('PATCH')[0]!.body).toMatchObject({ endMonth: '2026-12' });

    await user.click(button(/^Edit Salary/));
    expect(untilBox().value).toBe('2026-12');
    fireEvent.change(untilBox(), { target: { value: '' } });
    await user.click(button('Save changes'));
    await waitFor(() => expect(within(rowOf('Salary')).getByText(/ongoing/)).toBeTruthy());
    expect(api.sent('PATCH')[1]!.body).toMatchObject({ endMonth: null });
  });

  it('sends only the one-off fields for one-off income', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Edit Bonus/));
    expect(screen.getByText('One-off income')).toBeTruthy();
    expect(dateBox().value).toBe('2026-11-03');
    fireEvent.change(dateBox(), { target: { value: '2026-11-05' } });
    await user.click(button('Save changes'));

    await waitFor(() =>
      expect(within(rowOf('Bonus')).getByText('One-off · Nov 5, 2026')).toBeTruthy(),
    );
    expect(api.sent('PATCH')[0]!.body).toEqual({
      name: 'Bonus',
      amountMkd: 30_000,
      receivedOn: '2026-11-05',
    });
  });

  it('checks the values before sending, and can be cancelled', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));
    await user.clear(nameBox());
    await user.click(button('Save changes'));
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(api.sent('PATCH')).toEqual([]);

    await user.click(button('Cancel'));
    expect(screen.queryByText('Edit income')).toBeNull();
    expect(within(rowOf('Salary')).getByText('120,000 MKD')).toBeTruthy();
  });

  it('locks the other rows and the Add button while one row is open', async () => {
    const { user } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));

    expect((button(/^Edit Bonus/) as HTMLButtonElement).disabled).toBe(true);
    expect((button(/^Delete Bonus/) as HTMLButtonElement).disabled).toBe(true);
    expect((button('Add income') as HTMLButtonElement).disabled).toBe(true);

    await user.click(button('Cancel'));
    expect((button(/^Edit Bonus/) as HTMLButtonElement).disabled).toBe(false);
    expect((button('Add income') as HTMLButtonElement).disabled).toBe(false);
  });

  it('locks the rows while the add form is open', async () => {
    const { user } = setup();
    await ready();
    await openAdd(user);
    expect((button(/^Edit Salary/) as HTMLButtonElement).disabled).toBe(true);
    expect((button(/^Delete Salary/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the server's message and keeps the form open and filled", async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Edit Salary/));
    await user.clear(amountBox());
    await user.type(amountBox(), '777');
    api.failPatchWith(400, {
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { endMonth: 'End month cannot be before the start month' },
    });
    await user.click(button('Save changes'));

    expect(await screen.findByText('End month cannot be before the start month')).toBeTruthy();
    expect(amountBox().value).toBe('777');
    expect(screen.getByText('Edit income')).toBeTruthy();
  });
});

describe('deleting', () => {
  it('asks first, and keeps the income when you say so', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Delete Salary/));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete this income? This cannot be undone.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(items()).toHaveLength(3);
    expect(api.sent('DELETE')).toEqual([]);
  });

  it('deletes after confirming, and updates the list', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Delete Salary/));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(screen.queryByText('Salary')).toBeNull();
    expect(api.sent('DELETE')).toEqual([{ method: 'DELETE', path: '/income/i1' }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the empty state after the last income is deleted', async () => {
    const { user } = setup([rows()[1]!]);
    await ready();
    await user.click(button(/^Delete Bonus/));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );
    expect(await screen.findByText('No income yet. Add your salary to get started.')).toBeTruthy();
  });

  it('treats income that is already gone as deleted, without an error', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Delete Salary/));
    api.removeBehindTheScenes('i1');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when deleting fails, and the income stays', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(button(/^Delete Salary/));
    api.failDeleteWith(500, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(items()).toHaveLength(3);
    expect(api.data.map((i) => i.id)).toContain('i1');
  });
});

describe('getting there', () => {
  it('is reachable from the home page', async () => {
    const { user, router } = setup([], '/');
    await user.click(await screen.findByRole('link', { name: 'Income' }));
    expect(router.state.location.pathname).toBe('/income');
    await ready();
  });
});
