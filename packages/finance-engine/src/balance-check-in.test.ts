import { describe, expect, it } from 'vitest';
import { balanceCheckIn } from './balance-check-in.js';

const input = (over: Partial<Parameters<typeof balanceCheckIn>[0]> = {}) => ({
  openingMkd: 50_000,
  incomeMkd: 127_088,
  expensesMkd: 100_000,
  closingMkd: 77_088,
  ...over,
});

describe('balanceCheckIn', () => {
  it('has nothing untracked when the books match the bank', () => {
    expect(balanceCheckIn(input())).toEqual({ expectedMkd: 77_088, untrackedMkd: 0, alert: false });
  });

  it('shows money that left the account unrecorded as positive untracked spending', () => {
    const result = balanceCheckIn(input({ closingMkd: 70_000 }));
    expect(result.untrackedMkd).toBe(7_088);
    expect(result.alert).toBe(false); // 5.6 % of the income
  });

  it('alerts above 10 % of the income and not at exactly 10 %', () => {
    // Income 100,000: 10,000 untracked is exactly 10 %, 10,001 is more.
    const base = { openingMkd: 0, incomeMkd: 100_000, expensesMkd: 0 };
    expect(balanceCheckIn({ ...base, closingMkd: 90_000 }).alert).toBe(false);
    expect(balanceCheckIn({ ...base, closingMkd: 89_999 }).alert).toBe(true);
  });

  it('shows more money than explained as a negative amount, without an alert', () => {
    const result = balanceCheckIn(input({ closingMkd: 90_000 }));
    expect(result.untrackedMkd).toBe(-12_912);
    expect(result.alert).toBe(false);
  });

  it('alerts on any untracked spending in a month without income', () => {
    expect(
      balanceCheckIn({ openingMkd: 10_000, incomeMkd: 0, expensesMkd: 0, closingMkd: 9_999 }).alert,
    ).toBe(true);
    expect(
      balanceCheckIn({ openingMkd: 10_000, incomeMkd: 0, expensesMkd: 0, closingMkd: 10_000 })
        .alert,
    ).toBe(false);
  });

  it('allows an overdraft balance', () => {
    expect(balanceCheckIn(input({ openingMkd: -5_000, closingMkd: 22_088 })).untrackedMkd).toBe(0);
  });

  it('refuses fractions and negative income or expenses', () => {
    expect(() => balanceCheckIn(input({ closingMkd: 1.5 }))).toThrow(RangeError);
    expect(() => balanceCheckIn(input({ incomeMkd: -1 }))).toThrow(RangeError);
    expect(() => balanceCheckIn(input({ expensesMkd: -1 }))).toThrow(RangeError);
  });
});
