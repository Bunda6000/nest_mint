import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { mockApi, session, unauthorized } from '../../testing/mock-api';
import { AuthProvider } from '../auth/AuthContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const categories = {
  groups: [
    {
      id: 'g1',
      name: 'Banks',
      categories: [
        { id: 'c1', name: 'Mortgage' },
        { id: 'c2', name: 'Consumer loan' },
      ],
    },
    { id: 'g2', name: 'Food', categories: [{ id: 'c3', name: 'Groceries' }] },
  ],
};

function renderCategories() {
  const router = createMemoryRouter(routes, { initialEntries: ['/categories'] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

describe('CategoriesPage', () => {
  it('lists the groups and their categories', async () => {
    mockApi({
      'POST /auth/refresh': { status: 200, body: session },
      'GET /categories': { status: 200, body: categories },
    });
    renderCategories();

    const banks = (await screen.findByRole('heading', { name: 'Banks' })).closest('li')!;
    expect(within(banks).getByText('Mortgage')).toBeTruthy();
    expect(within(banks).getByText('Consumer loan')).toBeTruthy();
    const food = screen.getByRole('heading', { name: 'Food' }).closest('li')!;
    expect(within(food).getByText('Groceries')).toBeTruthy();
  });

  it('sends the access token with the request', async () => {
    const api = mockApi({
      'POST /auth/refresh': { status: 200, body: session },
      'GET /categories': { status: 200, body: categories },
    });
    renderCategories();
    await screen.findByRole('heading', { name: 'Banks' });

    const [, init] = api.calls('GET /categories')[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('renews an expired login and retries once, without bothering the user', async () => {
    let refreshes = 0;
    const api = mockApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return { status: 200, body: { ...session, accessToken: `token-${refreshes}` } };
      },
      'GET /categories': (init) =>
        (init?.headers as Record<string, string>).Authorization === 'Bearer token-2'
          ? { status: 200, body: categories }
          : unauthorized,
    });
    renderCategories();

    expect(await screen.findByRole('heading', { name: 'Banks' })).toBeTruthy();
    expect(refreshes).toBe(2);
    expect(api.calls('GET /categories').length).toBeGreaterThanOrEqual(2);
  });

  it('logs out when the login cannot be renewed', async () => {
    let refreshes = 0;
    mockApi({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return refreshes === 1 ? { status: 200, body: session } : unauthorized;
      },
      'GET /categories': unauthorized,
    });
    const router = renderCategories();

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows an error with a retry button when the server fails', async () => {
    let calls = 0;
    mockApi({
      'POST /auth/refresh': { status: 200, body: session },
      'GET /categories': () => {
        calls += 1;
        return calls === 1
          ? {
              status: 500,
              body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
            }
          : { status: 200, body: categories };
      },
    });
    renderCategories();
    const user = userEvent.setup();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load your categories.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Banks' })).toBeTruthy();
  });

  it('is reachable from the home page', async () => {
    mockApi({ 'POST /auth/refresh': { status: 200, body: session } });
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: 'Categories' }));

    expect(router.state.location.pathname).toBe('/categories');
  });
});
