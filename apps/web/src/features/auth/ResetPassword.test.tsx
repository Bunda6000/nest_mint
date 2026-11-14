import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const calls: { url: string; body: unknown }[] = [];
function fakeFetch(status = 204) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(
        status === 204
          ? null
          : JSON.stringify({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'This link has expired or was already used. Ask for a new one.',
              },
            }),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
}

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('password reset screens', () => {
  it('asks for a link and shows the same message for any email', async () => {
    fakeFetch();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send me a link' }));
    expect(await screen.findByText(/link to choose a new password is on its way/)).toBeTruthy();
    expect(calls[0]!.url).toContain('/auth/password-reset/request');
  });

  it('sets the new password using the token from the link', async () => {
    fakeFetch();
    render(
      <MemoryRouter initialEntries={[`/reset-password?token=${'t'.repeat(43)}`]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('New password'), 'a-long-new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/logged out everywhere/)).toBeTruthy();
    expect(calls[0]!.body).toEqual({ token: 't'.repeat(43), password: 'a-long-new-password' });
  });

  it('offers a new link when this one is no good', async () => {
    fakeFetch(400);
    render(
      <MemoryRouter initialEntries={[`/reset-password?token=${'t'.repeat(43)}`]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('New password'), 'a-long-new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy();
    expect(screen.getByText('Ask for a new link')).toBeTruthy();
  });
});
