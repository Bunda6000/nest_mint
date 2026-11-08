import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { session } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

interface Item {
  id: string;
  name: string;
  archived: boolean;
}
interface Category extends Item {
  groupId: string;
}
interface Group extends Item {
  categories: Category[];
}

const category = (id: string, groupId: string, name: string, archived = false): Category => ({
  id,
  groupId,
  name,
  archived,
});

const seed = (): Group[] => [
  {
    id: 'g1',
    name: 'Home',
    archived: false,
    categories: [category('c1', 'g1', 'Water'), category('c2', 'g1', 'Electricity')],
  },
  { id: 'g2', name: 'Food', archived: false, categories: [category('c3', 'g2', 'Groceries')] },
  {
    id: 'g3',
    name: 'Pets',
    archived: true,
    categories: [category('c4', 'g3', 'Vet', true)],
  },
];

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

/** A tiny stand-in for the API that keeps state, so a test can click through a whole flow. */
function fakeApi() {
  const groups = seed();
  const calls: Call[] = [];
  /** Answer the next change with this error instead of applying it. */
  let failNext: { status: number; code: string; message: string } | null = null;
  let unauthorizedNext = 0;
  let refreshes = 0;

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

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
    if (method === 'GET') {
      const all = path.includes('includeArchived=true');
      return reply(200, {
        groups: groups
          .filter((g) => all || !g.archived)
          .map((g) => ({ ...g, categories: g.categories.filter((c) => all || !c.archived) })),
      });
    }

    if (unauthorizedNext > 0) {
      unauthorizedNext -= 1;
      return reply(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } });
    }
    if (failNext) {
      const { status, code, message } = failNext;
      failNext = null;
      return reply(status, { error: { code, message } });
    }

    const ids = body?.ids as string[] | undefined;
    if (method === 'POST' && path === '/categories/groups') {
      groups.push({
        id: `g${groups.length + 1}`,
        name: String(body?.name),
        archived: false,
        categories: [],
      });
      return reply(201, {});
    }
    if (method === 'POST' && path === '/categories') {
      const group = groups.find((g) => g.id === body?.groupId)!;
      group.categories.push(category(`c${Date.now()}`, group.id, String(body?.name)));
      return reply(201, {});
    }
    if (method === 'PUT' && path === '/categories/groups/order') {
      groups.sort((a, b) => ids!.indexOf(a.id) - ids!.indexOf(b.id));
      return reply(204);
    }
    const groupOrder = /^\/categories\/groups\/(\w+)\/order$/.exec(path);
    if (method === 'PUT' && groupOrder) {
      const group = groups.find((g) => g.id === groupOrder[1])!;
      group.categories.sort((a, b) => ids!.indexOf(a.id) - ids!.indexOf(b.id));
      return reply(204);
    }
    const target = /^\/categories\/(groups\/)?(\w+)$/.exec(path);
    if (method === 'PATCH' && target) {
      const item: Item | undefined = target[1]
        ? groups.find((g) => g.id === target[2])
        : groups.flatMap((g) => g.categories).find((c) => c.id === target[2]);
      if (body?.name !== undefined) item!.name = String(body.name);
      if (body?.archived !== undefined) {
        item!.archived = Boolean(body.archived);
        if (target[1]) {
          for (const c of (item as Group).categories) c.archived ||= Boolean(body.archived);
        }
      }
      return reply(200, {});
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    changes: () => calls.filter((c) => c.method !== 'GET' && c.path !== '/auth/refresh'),
    gets: () => calls.filter((c) => c.method === 'GET'),
    failNextWith: (status: number, code: string, message: string) => {
      failNext = { status, code, message };
    },
    expireLoginOnce: () => {
      unauthorizedNext = 1;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
}

const button = (name: string) => screen.getByRole('button', { name });

describe('editing categories', () => {
  function setup() {
    const api = fakeApi();
    const router = createMemoryRouter(routes, { initialEntries: ['/categories'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    return { api, user: userEvent.setup() };
  }

  it('shows the plain list until you press Edit, and Done goes back', async () => {
    const { user } = setup();
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename Home' })).toBeNull();
    expect(screen.queryByText('Pets')).toBeNull();

    await startEditing(user);
    expect(button('Rename Home')).toBeTruthy();
    await user.click(button('Done'));
    expect(screen.queryByRole('button', { name: 'Rename Home' })).toBeNull();
  });

  it('adds a group', async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(button('+ Add group'));
    await user.type(screen.getByLabelText('New group name'), '  Gifts ');
    await user.click(button('Add'));

    expect(await screen.findByRole('heading', { name: 'Gifts' })).toBeTruthy();
    expect(api.changes()).toEqual([
      { method: 'POST', path: '/categories/groups', body: { name: 'Gifts' } },
    ]);
    expect(screen.queryByLabelText('New group name')).toBeNull();
  });

  it('adds a category to a group', async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(button('Add category to Food'));
    await user.type(screen.getByLabelText('New category in Food'), 'Snacks');
    await user.click(button('Add'));

    expect(await screen.findByText('Snacks')).toBeTruthy();
    expect(api.changes()).toEqual([
      { method: 'POST', path: '/categories', body: { groupId: 'g2', name: 'Snacks' } },
    ]);
  });

  it('renames an item, starting from its current name', async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(button('Rename Water'));
    const input = screen.getByLabelText('New name for Water');
    expect((input as HTMLInputElement).value).toBe('Water');
    await user.clear(input);
    await user.type(input, 'Water bill');
    await user.click(button('Save'));

    expect(await screen.findByText('Water bill')).toBeTruthy();
    expect(api.changes()).toEqual([
      { method: 'PATCH', path: '/categories/c1', body: { name: 'Water bill' } },
    ]);
  });

  it('does not send an empty name', async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(button('Rename Water'));
    await user.clear(screen.getByLabelText('New name for Water'));
    await user.click(button('Save'));

    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(api.changes()).toEqual([]);
  });

  it('moves items with the arrows and saves the whole new order', async () => {
    const { user, api } = setup();
    await startEditing(user);

    expect((button('Move Home up') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Move Food down') as HTMLButtonElement).disabled).toBe(true);

    await user.click(button('Move Home down'));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
        'Food',
        'Home',
      ]),
    );
    expect(api.changes()).toEqual([
      { method: 'PUT', path: '/categories/groups/order', body: { ids: ['g2', 'g1'] } },
    ]);

    await user.click(button('Move Electricity up'));
    await waitFor(() =>
      expect(api.changes().at(-1)).toEqual({
        method: 'PUT',
        path: '/categories/groups/g1/order',
        body: { ids: ['c2', 'c1'] },
      }),
    );
  });

  it('asks before archiving, and says what else is archived', async () => {
    const { user, api } = setup();
    await startEditing(user);

    await user.click(button('Archive Home'));
    expect(screen.getByText(/Its 2 categories will be archived too\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.changes()).toEqual([]);

    await user.click(button('Archive Food'));
    expect(screen.getByText(/Its 1 category will be archived too\./)).toBeTruthy();
    await user.click(button('Confirm archive Food'));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Food' })).toBeNull());
    expect(api.changes()).toEqual([
      { method: 'PATCH', path: '/categories/groups/g2', body: { archived: true } },
    ]);
  });

  it('shows archived items on request and restores them', async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(screen.getByLabelText('Show archived'));

    expect(await screen.findByText('Pets')).toBeTruthy();
    expect(api.gets().at(-1)!.path).toBe('/categories?includeArchived=true');
    const pets = screen.getByRole('heading', { name: /Pets/ }).closest('li')!;
    // A category of an archived group cannot be restored on its own.
    expect(within(pets).queryByRole('button', { name: 'Restore Vet' })).toBeNull();

    await user.click(button('Restore Pets'));
    await waitFor(() => expect(button('Rename Pets')).toBeTruthy());
    expect(api.changes()).toEqual([
      { method: 'PATCH', path: '/categories/groups/g3', body: { archived: false } },
    ]);
    expect(button('Restore Vet')).toBeTruthy();
  });

  it("shows the server's message when a name is in the archive, and keeps the form open", async () => {
    const { user, api } = setup();
    await startEditing(user);
    await user.click(button('+ Add group'));
    await user.type(screen.getByLabelText('New group name'), 'Pets');
    api.failNextWith(
      409,
      'NAME_IN_ARCHIVE',
      'A group named "Pets" is in your archive. Restore it instead.',
    );
    await user.click(button('Add'));

    expect((await screen.findByRole('alert')).textContent).toContain('is in your archive');
    expect((screen.getByLabelText('New group name') as HTMLInputElement).value).toBe('Pets');
  });

  it('reloads the list when it turns out to be out of date', async () => {
    const { user, api } = setup();
    await startEditing(user);
    const before = api.gets().length;
    api.failNextWith(409, 'CONFLICT', 'The list has changed. Reload the page and try again.');
    await user.click(button('Move Home down'));

    expect((await screen.findByRole('alert')).textContent).toContain('The list has changed');
    await waitFor(() => expect(api.gets().length).toBeGreaterThan(before));
  });

  it('renews an expired login and applies the change once', async () => {
    const { user, api } = setup();
    await startEditing(user);
    api.expireLoginOnce();
    await user.click(button('Rename Water'));
    await user.clear(screen.getByLabelText('New name for Water'));
    await user.type(screen.getByLabelText('New name for Water'), 'Aqua');
    await user.click(button('Save'));

    expect(await screen.findByText('Aqua')).toBeTruthy();
    const patches = api.calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(2); // refused once, then accepted with the new token
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
