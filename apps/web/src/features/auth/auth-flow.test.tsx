import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../routes';
import { mockApi, session, unauthorized } from '../../testing/mock-api';
import { AuthProvider } from './AuthContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path: string, { strict = false } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const app = (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  return router;
}

async function logIn(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('login flow', () => {
  it('sends a visitor without a session from the home page to the login page', async () => {
    mockApi({ 'POST /auth/refresh': unauthorized });
    const router = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('restores the session from the refresh cookie on page load', async () => {
    mockApi({ 'POST /auth/refresh': { status: 200, body: session } });
    renderApp('/');

    expect(await screen.findByText('Hello, Filip.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
  });

  it('asks for the refresh only once even when React runs effects twice', async () => {
    const api = mockApi({ 'POST /auth/refresh': { status: 200, body: session } });
    renderApp('/', { strict: true });

    await screen.findByText('Hello, Filip.');
    expect(api.calls('POST /auth/refresh')).toHaveLength(1);
  });

  it('logs in and lands on the home page', async () => {
    const api = mockApi({
      'POST /auth/refresh': unauthorized,
      'POST /auth/login': { status: 200, body: session },
    });
    const router = renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in' });

    await logIn(' Filip@Example.com ', 'correct-horse-battery');

    expect(await screen.findByText('Hello, Filip.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    const [, init] = api.calls('POST /auth/login')[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'filip@example.com',
      password: 'correct-horse-battery',
    });
    expect(init?.credentials).toBe('include');
  });

  it('shows the server message for wrong credentials and stays on the page', async () => {
    mockApi({
      'POST /auth/refresh': unauthorized,
      'POST /auth/login': {
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      },
    });
    const router = renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in' });

    await logIn('filip@example.com', 'wrong-password');

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.');
    expect(router.state.location.pathname).toBe('/login');
    expect((screen.getByRole('button', { name: 'Log in' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('does not call the API when the form is empty', async () => {
    const api = mockApi({ 'POST /auth/refresh': unauthorized });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in' });

    await logIn('', '');

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(api.calls('POST /auth/login')).toHaveLength(0);
  });

  it('logs out and returns to the login page', async () => {
    const api = mockApi({
      'POST /auth/refresh': { status: 200, body: session },
      'POST /auth/logout': { status: 204 },
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(api.calls('POST /auth/logout')).toHaveLength(1);
  });

  it('sends a logged-in user away from the login page', async () => {
    mockApi({ 'POST /auth/refresh': { status: 200, body: session } });
    const router = renderApp('/login');

    expect(await screen.findByText('Hello, Filip.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });
});
