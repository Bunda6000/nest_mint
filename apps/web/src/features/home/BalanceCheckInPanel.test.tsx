import type { BalanceCheckInResponse, BalanceCheckInStatusResponse } from '@nestmint/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalanceCheckInPanel } from './BalanceCheckInPanel';

const auth = vi.hoisted(() => ({ authedGet: vi.fn(), authedSend: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const checkIn = (over: Partial<BalanceCheckInResponse> = {}): BalanceCheckInResponse => ({
  month: '2026-10',
  fromMonth: '2026-10',
  openingMkd: 20_000,
  closingMkd: 50_000,
  incomeMkd: 100_000,
  expensesMkd: 60_000,
  expectedMkd: 60_000,
  untrackedMkd: 10_000,
  alert: false,
  ...over,
});

const status = (over: Partial<BalanceCheckInStatusResponse>): BalanceCheckInStatusResponse => ({
  month: '2026-10',
  checkIn: null,
  needsOpening: true,
  ...over,
});

describe('BalanceCheckInPanel', () => {
  it('asks for both balances the first time and shows the result', async () => {
    auth.authedGet.mockResolvedValue(status({}));
    auth.authedSend.mockResolvedValue(checkIn({ untrackedMkd: 15_000, alert: true }));
    const user = userEvent.setup();
    render(<BalanceCheckInPanel month="2026-10" />);

    await user.type(await screen.findByLabelText(/start of the month/i), '20,000');
    await user.type(screen.getByLabelText(/end of the month/i), '50000');
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(auth.authedSend).toHaveBeenCalledWith('PUT', '/balance-check-ins/2026-10', {
      closingBalanceMkd: 50_000,
      openingBalanceMkd: 20_000,
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /15,000.*not recorded.*more than 10% of your income/,
    );
  });

  it('asks only for the closing balance once an earlier check exists', async () => {
    auth.authedGet.mockResolvedValue(status({ needsOpening: false }));
    render(<BalanceCheckInPanel month="2026-10" />);
    await screen.findByLabelText(/end of the month/i);
    expect(screen.queryByLabelText(/start of the month/i)).toBeNull();
  });

  it('shows a saved check without an alarm when the gap is small, and allows a change', async () => {
    auth.authedGet.mockResolvedValue(status({ checkIn: checkIn(), needsOpening: false }));
    const user = userEvent.setup();
    render(<BalanceCheckInPanel month="2026-10" />);

    expect(await screen.findByText(/not recorded/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Change balance' }));
    expect((screen.getByLabelText(/end of the month/i) as HTMLInputElement).value).toBe('50000');
  });

  it('accepts a negative balance and refuses decimals', async () => {
    auth.authedGet.mockResolvedValue(status({ needsOpening: false }));
    auth.authedSend.mockResolvedValue(checkIn({ closingMkd: -500 }));
    const user = userEvent.setup();
    render(<BalanceCheckInPanel month="2026-10" />);

    const input = await screen.findByLabelText(/end of the month/i);
    await user.type(input, '12.5');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/whole denars/);
    expect(auth.authedSend).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '-500');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(auth.authedSend).toHaveBeenCalledWith('PUT', '/balance-check-ins/2026-10', {
        closingBalanceMkd: -500,
      }),
    );
  });
});
