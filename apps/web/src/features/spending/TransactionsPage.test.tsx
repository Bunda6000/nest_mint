import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const C4 = '44444444-4444-4444-8444-444444444444';
const C5 = '55555555-5555-4555-8555-555555555555';

interface Tx {
  id: string;
  kind: 'expense' | 'cash_withdrawal';
  categoryId: string;
  categoryName: string;
  amountMkd: number;
  occurredOn: string;
  note: string | null;
}

const tree = {
  groups: [
    {
      id: 'g1',
      name: 'Food',
      archived: false,
      categories: [
        { id: C1, groupId: 'g1', name: 'Groceries', archived: false },
        { id: C2, groupId: 'g1', name: 'Restaurants', archived: false },
      ],
    },
    {
      id: 'g2',
      name: 'Home',
      archived: false,
      categories: [
        { id: C3, groupId: 'g2', name: 'Water', archived: false },
        { id: C4, groupId: 'g2', name: 'Old bill', archived: true },
      ],
    },
    {
      id: 'g3',
      name: 'Banks',
      archived: false,
      categories: [{ id: C5, groupId: 'g3', name: 'Cash withdrawal', archived: false }],
    },
  ],
};
const names = new Map(tree.groups.flatMap((g) => g.categories).map((c) => [c.id, c.name]));

const rows = (): Tx[] => [
  {
    id: 't1',
    kind: 'expense',
    categoryId: C1,
    categoryName: 'Groceries',
    amountMkd: 450,
    occurredOn: '2026-11-07',
    note: 'Vero',
  },
  {
    id: 't2',
    kind: 'expense',
    categoryId: C2,
    categoryName: 'Restaurants',
    amountMkd: 300,
    occurredOn: '2026-11-03',
    note: null,
  },
  {
    id: 't3',
    kind: 'cash_withdrawal',
    categoryId: C5,
    categoryName: 'Cash withdrawal',
    amountMkd: 5000,
    occurredOn: '2026-11-05',
    note: null,
  },
  {
    id: 't4',
    kind: 'expense',
    categoryId: C3,
    categoryName: 'Water',
    amountMkd: 640,
    occurredOn: '2026-10-20',
    note: 'Oct bill',
  },
  {
    id: 't5',
    kind: 'expense',
    categoryId: C4,
    categoryName: 'Old bill',
    amountMkd: 100,
    occurredOn: '2026-11-02',
    note: null,
  },
];

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

type Failure = { status: number; error: Record<string, unknown> };

function fakeApi(initial: Tx[] = rows()) {
  const data = [...initial];
  const calls: Call[] = [];
  let failList = 0;
  let failCategories = 0;
  let failPatch: Failure | null = null;
  let failDelete: Failure | null = null;
  let expirePatch = false;
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
    if (method === 'GET' && path === '/categories?includeArchived=true') {
      if (failCategories > 0) {
        failCategories -= 1;
        return error(500, 'INTERNAL_ERROR', 'Something went wrong.');
      }
      return reply(200, tree);
    }
    if (method === 'GET' && path.startsWith('/transactions?month=')) {
      if (failList > 0) {
        failList -= 1;
        return error(500, 'INTERNAL_ERROR', 'Something went wrong.');
      }
      const query = new URLSearchParams(path.split('?')[1]);
      const month = query.get('month')!;
      const categoryId = query.get('categoryId');
      const found = data
        .filter((t) => t.occurredOn.startsWith(`${month}-`))
        .filter((t) => !categoryId || t.categoryId === categoryId)
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
      return reply(200, {
        month,
        transactions: found,
        totalMkd: found.reduce((sum, t) => sum + t.amountMkd, 0),
      });
    }
    const match = /^\/transactions\/([^/]+)$/.exec(path);
    if (match && method === 'PATCH') {
      if (expirePatch) {
        expirePatch = false;
        return error(401, 'UNAUTHORIZED', 'Please log in.');
      }
      if (failPatch) {
        const { status, error: failure } = failPatch;
        failPatch = null;
        return reply(status, { error: failure });
      }
      const row = data.find((t) => t.id === match[1]);
      if (!row) return error(404, 'NOT_FOUND', 'Transaction not found.');
      if (body?.categoryId !== undefined) {
        row.categoryId = String(body.categoryId);
        row.categoryName = names.get(row.categoryId) ?? '?';
      }
      if (body?.amountMkd !== undefined) row.amountMkd = Number(body.amountMkd);
      if (body?.occurredOn !== undefined) row.occurredOn = String(body.occurredOn);
      if (body && 'note' in body) row.note = (body.note as string | null) ?? null;
      return reply(200, row);
    }
    if (match && method === 'DELETE') {
      if (failDelete) {
        const { status, error: failure } = failDelete;
        failDelete = null;
        return reply(status, { error: failure });
      }
      const index = data.findIndex((t) => t.id === match[1]);
      if (index < 0) return error(404, 'NOT_FOUND', 'Transaction not found.');
      data.splice(index, 1);
      return reply(204);
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    data,
    calls,
    gets: (prefix: string) =>
      calls.filter((c) => c.method === 'GET' && c.path.startsWith(prefix)).map((c) => c.path),
    sent: (method: string) => calls.filter((c) => c.method === method),
    failListOnce: () => (failList = 1),
    failCategoriesOnce: () => (failCategories = 1),
    failPatchWith: (status: number, failure: Record<string, unknown>) =>
      (failPatch = { status, error: failure }),
    failDeleteWith: (status: number, failure: Record<string, unknown>) =>
      (failDelete = { status, error: failure }),
    expireLoginOnPatch: () => (expirePatch = true),
    removeBehindTheScenes: (id: string) => {
      const index = data.findIndex((t) => t.id === id);
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

function setup(initial: Tx[] = rows(), path = '/transactions') {
  const api = fakeApi(initial);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { api, router, user: userEvent.setup() };
}

const total = () => screen.getByTestId('month-total').textContent;
const items = () => screen.getAllByRole('listitem');
const rowOf = (text: string) => items().find((li) => li.textContent?.includes(text))!;
const editButton = (name: RegExp) => screen.getByRole('button', { name });
const amountBox = () => screen.getByLabelText('Amount (MKD)') as HTMLInputElement;
const noteBox = () => screen.getByLabelText('Note (optional)') as HTMLInputElement;
const dayBox = () => screen.getByLabelText('Date') as HTMLInputElement;
const chip = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

async function ready() {
  await screen.findByTestId('month-total');
}

describe('the month list', () => {
  it('shows this month newest first, with the total in denars and euros', async () => {
    setup();
    await ready();

    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(items().map((li) => li.textContent)).toEqual([
      expect.stringContaining('Groceries'),
      expect.stringContaining('Cash withdrawal'),
      expect.stringContaining('Restaurants'),
      expect.stringContaining('Old bill'),
    ]);
    expect(total()).toContain('5,850 MKD');
    expect(total()).toContain('≈ €95.12');
  });

  it('shows each row with note, date, amount, euros, and marks cash withdrawals', async () => {
    setup();
    await ready();

    const groceries = rowOf('Groceries');
    for (const text of ['Vero', 'Nov 7, 2026', '450 MKD', '€7.32']) {
      expect(within(groceries).getByText(text)).toBeTruthy();
    }
    expect(within(groceries).queryByText('Cash withdrawal')).toBeNull();

    const withdrawal = rowOf('5,000 MKD');
    expect(within(withdrawal).getAllByText('Cash withdrawal')).toHaveLength(2); // category + tag
    expect(within(withdrawal).getByText('€81.30')).toBeTruthy();
  });

  it('says so when a month has no expenses', async () => {
    const { user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(await screen.findByText('No expenses in September 2026.')).toBeTruthy();
    expect(total()).toContain('0 MKD');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('moving between months', () => {
  it('goes back and forward, and cannot go past the current month', async () => {
    const { user, api } = setup();
    await ready();
    const next = () => screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(within(rowOf('Water')).getByText('Oct bill')).toBeTruthy();
    expect(total()).toContain('640 MKD');
    expect(total()).toContain('≈ €10.41');
    expect(api.gets('/transactions')).toContain('/transactions?month=2026-10');

    expect(next().disabled).toBe(false);
    await user.click(next());
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeTruthy();
    await waitFor(() => expect(items()).toHaveLength(4));
  });

  it('crosses the year boundary', async () => {
    const { user, api } = setup();
    await ready();
    for (let i = 0; i < 11; i++) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
    }
    expect(await screen.findByRole('heading', { name: 'December 2025' })).toBeTruthy();
    expect(api.gets('/transactions')).toContain('/transactions?month=2025-12');
  });
});

describe('filtering by category', () => {
  it('lists every category, grouped, with archived ones marked', async () => {
    setup();
    await ready();
    const select = screen.getByRole('combobox', { name: 'Filter by category' });
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual([
      'All categories',
      'Groceries',
      'Restaurants',
      'Water',
      'Old bill (archived)',
      'Cash withdrawal',
    ]);
    expect(
      within(select)
        .getAllByRole('group')
        .map((g) => g.getAttribute('label')),
    ).toEqual(['Food', 'Home', 'Banks']);
  });

  it('narrows the list and the total, and can be undone', async () => {
    const { user, api } = setup();
    await ready();
    const select = screen.getByRole('combobox', { name: 'Filter by category' });

    await user.selectOptions(select, 'Groceries');
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(total()).toContain('450 MKD');
    expect(screen.getByText('Total (this category)')).toBeTruthy();
    expect(api.gets('/transactions')).toContain(`/transactions?month=2026-11&categoryId=${C1}`);

    await user.selectOptions(select, 'All categories');
    await waitFor(() => expect(items()).toHaveLength(4));
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('keeps the filter when changing month', async () => {
    const { user, api } = setup();
    await ready();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'Water');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    await waitFor(() =>
      expect(api.gets('/transactions')).toContain(`/transactions?month=2026-10&categoryId=${C3}`),
    );
    await waitFor(() => expect(total()).toContain('640 MKD'));
  });
});

describe('editing', () => {
  it('opens the row with its values filled in', async () => {
    const { user } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));

    expect(screen.getByText('Edit expense')).toBeTruthy();
    expect(amountBox().value).toBe('450');
    expect(chip('Groceries').checked).toBe(true);
    expect(dayBox().value).toBe('2026-11-07');
    expect(noteBox().value).toBe('Vero');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('saves a new amount and refreshes the list and the total', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(amountBox());
    await user.type(amountBox(), '500');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(within(rowOf('Groceries')).getByText('500 MKD')).toBeTruthy());
    expect(total()).toContain('5,900 MKD');
    expect(screen.queryByText('Edit expense')).toBeNull();
    expect(api.sent('PATCH')).toEqual([
      {
        method: 'PATCH',
        path: '/transactions/t1',
        body: { categoryId: C1, amountMkd: 500, occurredOn: '2026-11-07', note: 'Vero' },
      },
    ]);
  });

  it('can move the expense to another category, date and note', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.click(chip('Restaurants'));
    fireEvent.change(dayBox(), { target: { value: '2026-11-06' } });
    await user.clear(noteBox());
    await user.type(noteBox(), 'dinner');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByText('Edit expense')).toBeNull());
    expect(api.sent('PATCH')[0]!.body).toEqual({
      categoryId: C2,
      amountMkd: 450,
      occurredOn: '2026-11-06',
      note: 'dinner',
    });
  });

  it('clears the note when it is emptied', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(noteBox());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByText('Edit expense')).toBeNull());
    expect(api.sent('PATCH')[0]!.body).toMatchObject({ note: null });
    expect(within(rowOf('Groceries')).queryByText('Vero')).toBeNull();
  });

  it('drops the row from the list when the date moves to another month', async () => {
    const { user } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    fireEvent.change(dayBox(), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(items()).toHaveLength(3));
    expect(total()).toContain('5,400 MKD');
  });

  it('keeps an expense in its own archived category, shown as archived', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Old bill/));

    expect(chip('Old bill (archived)').checked).toBe(true);
    expect(screen.queryByRole('radio', { name: 'Old bill' })).toBeNull();
    await user.clear(amountBox());
    await user.type(amountBox(), '120');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByText('Edit expense')).toBeNull());
    expect(api.sent('PATCH')[0]!.body).toMatchObject({ categoryId: C4, amountMkd: 120 });
  });

  it('checks the values before sending', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(amountBox());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Enter an amount')).toBeTruthy();
    expect(api.sent('PATCH')).toEqual([]);
    expect(screen.getByText('Edit expense')).toBeTruthy();
  });

  it('can be cancelled without changing anything', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(amountBox());
    await user.type(amountBox(), '999');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Edit expense')).toBeNull();
    expect(within(rowOf('Groceries')).getByText('450 MKD')).toBeTruthy();
    expect(api.sent('PATCH')).toEqual([]);
  });

  it('locks the other rows, the month buttons and the filter while one row is open', async () => {
    const { user } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));

    expect((editButton(/^Edit Restaurants/) as HTMLButtonElement).disabled).toBe(true);
    expect((editButton(/^Delete Restaurants/) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('combobox', { name: 'Filter by category' }) as HTMLSelectElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((editButton(/^Edit Restaurants/) as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows the server's message and keeps the form open and filled", async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(amountBox());
    await user.type(amountBox(), '600');
    api.failPatchWith(400, {
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { occurredOn: 'Date cannot be in the future' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Date cannot be in the future')).toBeTruthy();
    expect(amountBox().value).toBe('600');
    expect(screen.getByText('Edit expense')).toBeTruthy();
  });

  it('reloads the categories when the chosen one is no longer available', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.click(chip('Restaurants'));
    const before = api.gets('/categories').length;
    api.failPatchWith(409, {
      code: 'CONFLICT',
      message: 'This category is archived. Pick another one.',
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This category is archived. Pick another one.')).toBeTruthy();
    await waitFor(() => expect(api.gets('/categories').length).toBeGreaterThan(before));
    expect(chip('Restaurants').checked).toBe(false);
  });

  it('renews an expired login and saves once', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Edit Groceries/));
    await user.clear(amountBox());
    await user.type(amountBox(), '470');
    api.expireLoginOnPatch();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(within(rowOf('Groceries')).getByText('470 MKD')).toBeTruthy());
    expect(api.sent('PATCH')).toHaveLength(2); // refused once, then accepted with the new token
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('deleting', () => {
  it('asks first, and keeps the expense when you say so', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Delete Groceries/));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete this expense? This cannot be undone.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(items()).toHaveLength(4);
    expect(api.sent('DELETE')).toEqual([]);
  });

  it('deletes after confirming, and updates the list and the total', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Delete Groceries/));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    await waitFor(() => expect(items()).toHaveLength(3));
    expect(screen.queryByText('Vero')).toBeNull();
    expect(total()).toContain('5,400 MKD');
    expect(api.sent('DELETE')).toEqual([{ method: 'DELETE', path: '/transactions/t1' }]);
    expect(api.data.map((t) => t.id)).not.toContain('t1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the empty month after the last expense is deleted', async () => {
    const { user } = setup([rows()[0]!]);
    await ready();
    await user.click(editButton(/^Delete Groceries/));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    expect(await screen.findByText('No expenses in November 2026.')).toBeTruthy();
    expect(total()).toContain('0 MKD');
  });

  it('treats an expense that is already gone as deleted, without an error', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Delete Groceries/));
    api.removeBehindTheScenes('t1');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    await waitFor(() => expect(items()).toHaveLength(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when deleting fails, and the expense stays', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(editButton(/^Delete Groceries/));
    api.failDeleteWith(500, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }),
    );

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(items()).toHaveLength(4);
    expect(api.data.map((t) => t.id)).toContain('t1');
  });
});

describe('loading', () => {
  it('offers a retry when the month cannot be loaded', async () => {
    const api = fakeApi();
    api.failListOnce();
    const router = createMemoryRouter(routes, { initialEntries: ['/transactions'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load your expenses.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
    expect(items()).toHaveLength(4);
  });

  it('still shows the list when only the categories fail, and can retry them', async () => {
    const api = fakeApi();
    api.failCategoriesOnce();
    const router = createMemoryRouter(routes, { initialEntries: ['/transactions'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await ready();

    expect(items()).toHaveLength(4);
    expect(await screen.findByText(/Could not load your categories/)).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: 'Filter by category' }) as HTMLSelectElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Filter by category' }) as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
  });
});

describe('getting there', () => {
  it('is reachable from the home page and links on to adding an expense', async () => {
    const { user, router } = setup([], '/');
    await user.click(await screen.findByRole('link', { name: 'Expenses' }));
    expect(router.state.location.pathname).toBe('/transactions');

    await ready();
    await user.click(screen.getByRole('link', { name: 'Add expense' }));
    expect(router.state.location.pathname).toBe('/expenses/new');
  });
});
