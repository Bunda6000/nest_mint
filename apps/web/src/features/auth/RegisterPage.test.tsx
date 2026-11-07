import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterPage', () => {
  it('shows inline errors and does not call the API when input is invalid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RegisterPage />);

    await fillAndSubmit('not-an-email', 'short');

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Password must be at least 10 characters')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server error next to the email field when it is already registered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'EMAIL_ALREADY_REGISTERED',
              message: 'An account with this email already exists.',
              details: { email: 'An account with this email already exists' },
            },
          }),
          { status: 409 },
        ),
      ),
    );
    render(<RegisterPage />);

    await fillAndSubmit('filip@example.com', 'correct-horse-battery');

    expect(await screen.findByText('An account with this email already exists')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('confirms the account after a successful registration', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ id: 'u1', email: 'filip@example.com', displayName: null }),
            { status: 201 },
          ),
        ),
    );
    render(<RegisterPage />);

    await fillAndSubmit('filip@example.com', 'correct-horse-battery');

    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeTruthy();
  });
});
