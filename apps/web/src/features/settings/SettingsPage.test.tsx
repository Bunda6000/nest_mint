import type { ExchangeRatesResponse } from '@nestmint/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertMkdToEur, setRates } from '../../rates';
import { SettingsPage } from './SettingsPage';

const auth = vi.hoisted(() => ({ authedGet: vi.fn(), authedSend: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

const data = (rates: ExchangeRatesResponse['rates']): ExchangeRatesResponse => ({
  defaultMkdPerEur: 61.5,
  rates,
});

beforeEach(() =>
  auth.authedGet.mockResolvedValue(data([{ effectiveFrom: '2026-06-01', mkdPerEur: 61.7 }])),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setRates([]);
});

describe('SettingsPage', () => {
  it('lists the default and saved rates and applies them to conversions', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('61.7 MKD / EUR')).toBeTruthy();
    expect(screen.getByText('61.5 MKD / EUR')).toBeTruthy();
    // 6,170 MKD is 100.00 EUR at 61.7 and 100.33 at 61.5.
    expect(convertMkdToEur(6_170, '2026-07-01').eurCents).toBe(10_000);
    expect(convertMkdToEur(6_170, '2026-05-31').eurCents).toBe(10_033);
  });

  it('saves a rate for a day and reloads', async () => {
    auth.authedSend.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    await screen.findByText('61.7 MKD / EUR');
    await user.type(screen.getByLabelText('Rate (MKD per EUR)'), '61,9');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    const [method, path, body] = auth.authedSend.mock.calls[0] as [string, string, object];
    expect(method).toBe('PUT');
    expect(path).toMatch(/^\/settings\/rates\/\d{4}-\d{2}-\d{2}$/);
    expect(body).toEqual({ mkdPerEur: 61.9 });
    expect(auth.authedGet).toHaveBeenCalledTimes(2);
  });

  it('asks for a rate when the box is empty', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    await screen.findByText('61.7 MKD / EUR');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter the rate');
    expect(auth.authedSend).not.toHaveBeenCalled();
  });
});
