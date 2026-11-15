import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: '1', email: 'a@b.com', displayName: 'Filip' } },
    logout: auth.logout,
  }),
}));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/goals']}>
      <AppShell>
        <p>Page content</p>
      </AppShell>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('AppShell', () => {
  it('shows every screen in the main menu and marks the current one', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    expect(nav.querySelectorAll('a')).toHaveLength(10);
    expect(screen.getByRole('link', { name: 'Goals' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(screen.getByText('Filip')).toBeTruthy();
  });

  it('opens and closes the menu on small screens', async () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('logs out', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(auth.logout).toHaveBeenCalled();
  });
});
