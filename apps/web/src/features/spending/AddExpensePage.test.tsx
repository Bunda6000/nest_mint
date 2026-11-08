import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

// Real category ids are UUIDs and the form checks that, so the fake data must look like them.
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';

interface Tx {
  id: string;
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
      categories: [{ id: C3, groupId: 'g2', name: 'Water', archived: false }],
    },
    { id: 'g3', name: 'Pets', archived: false, categories: [] },
  ],
};

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function fakeApi(initial: Tx[] = []) {
  const transactions = [...initial];
  const calls: Call[] = [];
  let failNextPost: { status: number; error: Record<string, unknown> } | null = null;
  let unauthorizedNextPost = false;
  let holdNextPost: Promise<void> | null = null;
  let failCategories = 0;
  let failRecent = 0;
  let refreshes = 0;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const names = new Map(tree.groups.flatMap((g) => g.categories).map((c) => [c.id, c.name]));

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
    if (method === 'GET' && path === '/categories') {
      if (failCategories > 0) {
        failCategories -= 1;
        return reply(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
      }
      return reply(200, tree);
    }
    if (method === 'GET' && path.startsWith('/transactions')) {
      if (failRecent > 0) {
        failRecent -= 1;
        return reply(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
      }
      const newest = [...transactions].reverse();
      return reply(200, { transactions: newest.slice(0, 10) });
    }
    if (method === 'POST' && path === '/transactions') {
      if (holdNextPost) {
        const gate = holdNextPost;
        holdNextPost = null;
        await gate;
      }
      if (unauthorizedNextPost) {
        unauthorizedNextPost = false;
        return reply(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } });
      }
      if (failNextPost) {
        const { status, error } = failNextPost;
        failNextPost = null;
        return reply(status, { error });
      }
      const created: Tx = {
        id: `t${transactions.length + 1}`,
        categoryId: String(body?.categoryId),
        categoryName: names.get(String(body?.categoryId)) ?? '?',
        amountMkd: Number(body?.amountMkd),
        occurredOn: String(body?.occurredOn),
        note: typeof body?.note === 'string' ? body.note : null,
      };
      transactions.push(created);
      return reply(201, created);
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    posts: () => calls.filter((c) => c.method === 'POST' && c.path === '/transactions'),
    count: (path: string) => calls.filter((c) => c.method === 'GET' && c.path === path).length,
    failNextPostWith: (status: number, error: Record<string, unknown>) => {
      failNextPost = { status, error };
    },
    expireLoginOnce: () => {
      unauthorizedNextPost = true;
    },
    holdNextPost: () => {
      let release!: () => void;
      holdNextPost = new Promise<void>((resolve) => (release = resolve));
      return release;
    },
    failCategoriesOnce: () => {
      failCategories = 1;
    },
    failRecentOnce: () => {
      failRecent = 1;
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

function setup(initial: Tx[] = [], path = '/expenses/new') {
  const api = fakeApi(initial);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { api, router, user: userEvent.setup() };
}

const amountBox = () => screen.getByLabelText('Amount (MKD)') as HTMLInputElement;
const dayBox = () => screen.getByLabelText('Date') as HTMLInputElement;
const noteBox = () => screen.getByLabelText('Note (optional)') as HTMLInputElement;
const chip = (name: string) => screen.getByRole('radio', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save expense' });

async function ready() {
  await screen.findByLabelText('Amount (MKD)');
}

describe('the form', () => {
  it("starts with the amount focused, today's date, and the categories grouped", async () => {
    setup();
    await ready();

    expect(document.activeElement).toBe(amountBox());
    expect(dayBox().value).toBe('2026-11-08');
    expect(noteBox().value).toBe('');
    for (const name of ['Groceries', 'Restaurants', 'Water']) expect(chip(name)).toBeTruthy();
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    // A group with nothing to pick is not shown.
    expect(screen.queryByText('Pets')).toBeNull();
  });

  it('shows a live euro estimate while typing', async () => {
    const { user } = setup();
    await ready();

    await user.type(amountBox(), '1230');
    expect(screen.getByText('≈ €20.00')).toBeTruthy();

    await user.clear(amountBox());
    await user.type(amountBox(), '450');
    expect(screen.getByText('≈ €7.32')).toBeTruthy();

    await user.clear(amountBox());
    await user.type(amountBox(), '1,250');
    expect(screen.getByText('≈ €20.33')).toBeTruthy();

    await user.clear(amountBox());
    await user.type(amountBox(), '12.5');
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it('shows no estimate for an empty amount, zero, or a cleared date', async () => {
    const { user } = setup();
    await ready();
    expect(screen.queryByText(/≈/)).toBeNull();

    await user.type(amountBox(), '0');
    expect(screen.queryByText(/≈/)).toBeNull();

    await user.clear(amountBox());
    await user.type(amountBox(), '100');
    expect(screen.getByText('≈ €1.63')).toBeTruthy();
    fireEvent.change(dayBox(), { target: { value: '' } });
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});

describe('saving', () => {
  it('saves in three steps: amount, category, Save', async () => {
    const { user, api } = setup();
    await ready();

    await user.type(amountBox(), '450');
    await user.click(chip('Groceries'));
    await user.click(saveButton());

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Saved: 450 MKD · Groceries',
    );
    expect(api.posts()).toEqual([
      {
        method: 'POST',
        path: '/transactions',
        body: { categoryId: C1, amountMkd: 450, occurredOn: '2026-11-08' },
      },
    ]);
  });

  it('clears the amount and note, keeps category and date, and puts the cursor back on the amount', async () => {
    const { user } = setup();
    await ready();
    await user.type(amountBox(), '450');
    await user.type(noteBox(), 'Vero');
    await user.click(chip('Restaurants'));
    fireEvent.change(dayBox(), { target: { value: '2026-11-05' } });
    await user.click(saveButton());
    await screen.findByRole('status');

    expect(amountBox().value).toBe('');
    expect(noteBox().value).toBe('');
    expect((chip('Restaurants') as HTMLInputElement).checked).toBe(true);
    expect(dayBox().value).toBe('2026-11-05');
    expect(document.activeElement).toBe(amountBox());
  });

  it('sends the note and the chosen date, and understands thousands separators', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '1,250');
    await user.type(noteBox(), '  weekly shop  ');
    await user.click(chip('Water'));
    fireEvent.change(dayBox(), { target: { value: '2026-11-01' } });
    await user.click(saveButton());
    await screen.findByRole('status');

    expect(api.posts()[0]!.body).toEqual({
      categoryId: C3,
      amountMkd: 1250,
      occurredOn: '2026-11-01',
      note: 'weekly shop',
    });
  });

  it('shows the new expense in the recent list, with euros', async () => {
    const { user } = setup();
    await ready();
    expect(await screen.findByText('No expenses yet.')).toBeTruthy();

    await user.type(amountBox(), '1230');
    await user.type(noteBox(), 'Vero');
    await user.click(chip('Groceries'));
    await user.click(saveButton());

    const list = await screen.findByRole('list');
    const item = within(list).getByText('Groceries').closest('li')!;
    expect(within(item).getByText('Vero')).toBeTruthy();
    expect(within(item).getByText('Nov 8, 2026')).toBeTruthy();
    expect(within(item).getByText('1,230 MKD')).toBeTruthy();
    expect(within(item).getByText('€20.00')).toBeTruthy();
    expect(screen.queryByText('No expenses yet.')).toBeNull();
  });

  it('sends only one request when Save is pressed twice quickly', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '99');
    await user.click(chip('Groceries'));
    const release = api.holdNextPost();

    await user.click(saveButton());
    const saving = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    await user.click(saving);
    release();

    await screen.findByRole('status');
    expect(api.posts()).toHaveLength(1);
    expect(saveButton().textContent).toBe('Save expense');
  });

  it('renews an expired login and saves once', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '75');
    await user.click(chip('Groceries'));
    api.expireLoginOnce();
    await user.click(saveButton());

    await screen.findByRole('status');
    expect(api.posts()).toHaveLength(2); // refused once, then accepted with the new token
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText('75 MKD')).toBeTruthy();
  });
});

describe('checking before sending', () => {
  it('asks for an amount and a category when both are missing, and sends nothing', async () => {
    const { user, api } = setup();
    await ready();
    await user.click(saveButton());

    expect(screen.getByText('Enter an amount')).toBeTruthy();
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(api.posts()).toEqual([]);
  });

  it.each([
    ['12.5', 'Enter whole denars, for example 1250'],
    ['1.250', 'Enter whole denars, for example 1250'],
    ['0', 'Enter an amount above 0'],
    ['abc', 'Use digits only, for example 1250'],
    ['100000001', 'Amount must be at most 100,000,000'],
  ])('refuses an amount of %j', async (typed, message) => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), typed);
    await user.click(chip('Groceries'));
    await user.click(saveButton());

    expect(screen.getByText(message)).toBeTruthy();
    expect(api.posts()).toEqual([]);
    expect(amountBox().value).toBe(typed);
  });

  it('asks for a date when it was cleared', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '50');
    await user.click(chip('Groceries'));
    fireEvent.change(dayBox(), { target: { value: '' } });
    await user.click(saveButton());

    expect(screen.getByText('Choose a date')).toBeTruthy();
    expect(api.posts()).toEqual([]);
  });

  it('removes the messages once the form is correct', async () => {
    const { user } = setup();
    await ready();
    await user.click(saveButton());
    expect(screen.getByText('Enter an amount')).toBeTruthy();

    await user.type(amountBox(), '50');
    await user.click(chip('Groceries'));
    await user.click(saveButton());

    await screen.findByRole('status');
    expect(screen.queryByText('Enter an amount')).toBeNull();
    expect(screen.queryByText('Choose a category')).toBeNull();
  });
});

describe('when the server says no', () => {
  it("shows the server's field message and keeps what was typed", async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '450');
    await user.type(noteBox(), 'keep me');
    await user.click(chip('Groceries'));
    api.failNextPostWith(400, {
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { occurredOn: 'Date cannot be in the future' },
    });
    await user.click(saveButton());

    expect(await screen.findByText('Date cannot be in the future')).toBeTruthy();
    expect(amountBox().value).toBe('450');
    expect(noteBox().value).toBe('keep me');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reloads the categories when the chosen one is no longer available', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '450');
    await user.click(chip('Groceries'));
    const before = api.count('/categories');
    api.failNextPostWith(409, {
      code: 'CONFLICT',
      message: 'This category is archived. Pick another one.',
    });
    await user.click(saveButton());

    expect(await screen.findByText('This category is archived. Pick another one.')).toBeTruthy();
    await waitFor(() => expect(api.count('/categories')).toBeGreaterThan(before));
    await waitFor(() => expect((chip('Groceries') as HTMLInputElement).checked).toBe(false));
    expect(amountBox().value).toBe('450');
  });

  it('shows a general message for an unexpected failure and allows trying again', async () => {
    const { user, api } = setup();
    await ready();
    await user.type(amountBox(), '450');
    await user.click(chip('Groceries'));
    api.failNextPostWith(500, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    await user.click(saveButton());

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    await user.click(saveButton());
    await screen.findByRole('status');
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();
  });
});

describe('loading', () => {
  it('lists recent expenses, newest first', async () => {
    setup([
      {
        id: 't1',
        categoryId: C1,
        categoryName: 'Groceries',
        amountMkd: 100,
        occurredOn: '2026-11-01',
        note: null,
      },
      {
        id: 't2',
        categoryId: C3,
        categoryName: 'Water',
        amountMkd: 640,
        occurredOn: '2026-11-05',
        note: 'Oct bill',
      },
    ]);
    await ready();

    const items = await screen.findAllByRole('listitem');
    const rows = items.filter((li) => li.textContent?.includes('MKD')).map((li) => li.textContent);
    expect(rows[0]).toContain('Water');
    expect(rows[0]).toContain('Oct bill');
    expect(rows[0]).toContain('€10.41');
    expect(rows[1]).toContain('Groceries');
  });

  it('offers a retry when the categories cannot be loaded', async () => {
    const api = fakeApi();
    api.failCategoriesOnce();
    const router = createMemoryRouter(routes, { initialEntries: ['/expenses/new'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load your categories.',
    );
    expect(screen.queryByLabelText('Amount (MKD)')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
    expect(chip('Groceries')).toBeTruthy();
  });

  it('still lets you add an expense when the recent list cannot be loaded', async () => {
    const api = fakeApi();
    api.failRecentOnce();
    const router = createMemoryRouter(routes, { initialEntries: ['/expenses/new'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await ready();

    expect(await screen.findByText(/Could not load recent expenses/)).toBeTruthy();
    await user.type(amountBox(), '30');
    await user.click(chip('Groceries'));
    await user.click(saveButton());
    await screen.findByRole('status');
    expect(api.posts()).toHaveLength(1);
  });
});

describe('getting there', () => {
  it('is reachable from the home page', async () => {
    const { user, router } = setup([], '/');
    await user.click(await screen.findByRole('link', { name: 'Add expense' }));

    expect(router.state.location.pathname).toBe('/expenses/new');
    await ready();
  });
});
