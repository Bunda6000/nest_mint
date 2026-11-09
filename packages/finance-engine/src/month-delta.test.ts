import { describe, expect, it } from 'vitest';
import { amountChange, compareMonths } from './month-delta.js';
import { monthlySummary } from './monthly-summary.js';

describe('amountChange', () => {
  it('is the difference and its size relative to the previous value', () => {
    expect(amountChange(108_000, 100_000)).toEqual({ amount: 8_000, ratio: 0.08 });
    expect(amountChange(90_000, 100_000)).toEqual({ amount: -10_000, ratio: -0.1 });
  });

  it('is no change at all when the amounts are equal', () => {
    expect(amountChange(5_000, 5_000)).toEqual({ amount: 0, ratio: 0 });
  });

  it('has no ratio when the previous value was 0', () => {
    expect(amountChange(5_000, 0)).toEqual({ amount: 5_000, ratio: null });
    expect(amountChange(0, 0)).toEqual({ amount: 0, ratio: null });
  });

  it('can go down to 0 from something (a drop of 100%)', () => {
    expect(amountChange(0, 4_000)).toEqual({ amount: -4_000, ratio: -1 });
  });

  it('measures against the size of a negative previous value, so an improvement stays positive', () => {
    expect(amountChange(50, -100)).toEqual({ amount: 150, ratio: 1.5 });
    expect(amountChange(-150, -100)).toEqual({ amount: -50, ratio: -0.5 });
  });

  it('refuses fractional denars', () => {
    expect(() => amountChange(10.5, 10)).toThrow(RangeError);
    expect(() => amountChange(10, 9.5)).toThrow(RangeError);
  });
});

describe('compareMonths', () => {
  it('compares January 2025 of Budget.xlsx with a lighter month before it', () => {
    const january = monthlySummary(146_308, 82_272);
    const december = monthlySummary(146_308, 100_000);
    const result = compareMonths(january, december);
    expect(result.income).toEqual({ amount: 0, ratio: 0 });
    expect(result.expenses.amount).toBe(-17_728);
    expect(result.expenses.ratio).toBeCloseTo(-0.17728, 5);
    expect(result.net.amount).toBe(17_728);
    expect(result.net.ratio).toBeCloseTo(17_728 / 46_308, 6);
    expect(result.savingsRate).toBeCloseTo(64_036 / 146_308 - 46_308 / 146_308, 8);
  });

  it('gives the savings rate change as a difference of the two rates', () => {
    const result = compareMonths(monthlySummary(100_000, 70_000), monthlySummary(100_000, 75_000));
    expect(result.savingsRate).toBeCloseTo(0.05, 10);
    const worse = compareMonths(monthlySummary(100_000, 80_000), monthlySummary(100_000, 70_000));
    expect(worse.savingsRate).toBeCloseTo(-0.1, 10);
  });

  it('has no savings rate change when either month had no income', () => {
    const empty = monthlySummary(0, 5_000);
    const normal = monthlySummary(100_000, 60_000);
    expect(compareMonths(normal, empty).savingsRate).toBeNull();
    expect(compareMonths(empty, normal).savingsRate).toBeNull();
    expect(compareMonths(empty, empty).savingsRate).toBeNull();
  });

  it('still compares the amounts when there was no income last month', () => {
    const result = compareMonths(monthlySummary(100_000, 60_000), monthlySummary(0, 5_000));
    expect(result.income).toEqual({ amount: 100_000, ratio: null });
    expect(result.expenses).toEqual({ amount: 55_000, ratio: 11 });
    expect(result.net).toEqual({ amount: 45_000, ratio: 9 });
  });

  it('does not change what it is given', () => {
    const a = monthlySummary(100_000, 60_000);
    const b = monthlySummary(90_000, 50_000);
    const before = JSON.stringify([a, b]);
    compareMonths(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});
