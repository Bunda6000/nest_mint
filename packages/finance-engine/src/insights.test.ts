import { describe, expect, it } from 'vitest';
import { donutSlices, monthlyHistory, monthsEndingAt, OTHER_KEY, shiftMonth } from './insights.js';
import type { IncomeSource } from './monthly-totals.js';

const salary = (
  amountMkd: number,
  startMonth: string,
  endMonth: string | null = null,
): IncomeSource => ({
  recurrence: 'monthly',
  amountMkd,
  receivedOn: null,
  startMonth,
  endMonth,
});
const bonus = (amountMkd: number, receivedOn: string): IncomeSource => ({
  recurrence: 'one_off',
  amountMkd,
  receivedOn,
  startMonth: null,
  endMonth: null,
});

describe('shiftMonth', () => {
  it.each([
    ['2026-11', 1, '2026-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-03', -14, '2025-01'],
    ['2026-11', 0, '2026-11'],
    ['2000-01', -1, '1999-12'],
  ])('%s shifted by %d is %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('refuses something that is not a month', () => {
    expect(() => shiftMonth('2026-13', 1)).toThrow(RangeError);
    expect(() => shiftMonth('nov', 1)).toThrow(RangeError);
  });
});

describe('monthsEndingAt', () => {
  it('lists the months oldest first, ending at the given one', () => {
    expect(monthsEndingAt('2026-11', 3)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(monthsEndingAt('2026-11', 1)).toEqual(['2026-11']);
  });

  it('runs across a year boundary for twelve months', () => {
    const months = monthsEndingAt('2026-02', 12);
    expect(months[0]).toBe('2025-03');
    expect(months[11]).toBe('2026-02');
    expect(new Set(months).size).toBe(12);
  });

  it('refuses a count that is not a whole number of 1 or more', () => {
    expect(() => monthsEndingAt('2026-11', 0)).toThrow(RangeError);
    expect(() => monthsEndingAt('2026-11', 2.5)).toThrow(RangeError);
  });
});

describe('monthlyHistory', () => {
  it('gives income, expenses, net and a running total for every month', () => {
    const history = monthlyHistory('2026-03', 3, [salary(100_000, '2026-01')], {
      '2026-01': 60_000,
      '2026-02': 120_000,
      '2026-03': 40_000,
    });
    expect(history.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(history.map((m) => m.income)).toEqual([100_000, 100_000, 100_000]);
    expect(history.map((m) => m.expenses)).toEqual([60_000, 120_000, 40_000]);
    expect(history.map((m) => m.net)).toEqual([40_000, -20_000, 60_000]);
    expect(history.map((m) => m.cumulativeNet)).toEqual([40_000, 20_000, 80_000]);
    expect(history[1]!.savingsRate).toBeCloseTo(-0.2, 10);
  });

  it('treats a month with no recorded spending as spending nothing', () => {
    const history = monthlyHistory('2026-02', 2, [salary(50_000, '2026-01')], {
      '2026-02': 10_000,
    });
    expect(history.map((m) => m.expenses)).toEqual([0, 10_000]);
    expect(history.map((m) => m.cumulativeNet)).toEqual([50_000, 90_000]);
  });

  it('counts a salary only in the months it runs, and one-off income in its month', () => {
    const history = monthlyHistory(
      '2026-04',
      4,
      [salary(80_000, '2026-02', '2026-03'), bonus(20_000, '2026-04-10')],
      {},
    );
    expect(history.map((m) => m.income)).toEqual([0, 80_000, 80_000, 20_000]);
    expect(history[0]!.savingsRate).toBeNull();
  });

  it('starts the running total at 0 in the first month shown, whatever came before', () => {
    const history = monthlyHistory('2026-03', 2, [salary(100_000, '2025-01')], {
      '2026-01': 999_999,
      '2026-02': 10_000,
      '2026-03': 10_000,
    });
    expect(history.map((m) => m.cumulativeNet)).toEqual([90_000, 180_000]);
  });

  it('matches January 2025 of Budget.xlsx', () => {
    const history = monthlyHistory('2025-01', 1, [salary(146_308, '2024-01')], {
      '2025-01': 82_272,
    });
    expect(history[0]).toMatchObject({
      income: 146_308,
      expenses: 82_272,
      net: 64_036,
      cumulativeNet: 64_036,
    });
    expect(history[0]!.savingsRate).toBeCloseTo(0.4377, 4);
  });

  it('covers twelve months across a year boundary', () => {
    const history = monthlyHistory('2026-02', 12, [salary(10_000, '2020-01')], {});
    expect(history).toHaveLength(12);
    expect(history[0]!.month).toBe('2025-03');
    expect(history[11]!.cumulativeNet).toBe(120_000);
  });
});

describe('donutSlices', () => {
  const item = (key: string, amount: number) => ({ key, label: key.toUpperCase(), amount });

  it('sorts biggest first and gives each slice its share', () => {
    const slices = donutSlices([item('a', 25), item('b', 75)], 6);
    expect(slices.map((s) => s.key)).toEqual(['b', 'a']);
    expect(slices.map((s) => s.share)).toEqual([0.75, 0.25]);
  });

  it('leaves out items of 0 and gives nothing for no spending', () => {
    expect(donutSlices([item('a', 0), item('b', 10)], 6).map((s) => s.key)).toEqual(['b']);
    expect(donutSlices([item('a', 0)], 6)).toEqual([]);
    expect(donutSlices([], 6)).toEqual([]);
  });

  it('adds up items that share a key', () => {
    const slices = donutSlices([item('a', 10), item('a', 15), item('b', 5)], 6);
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ key: 'a', amount: 25 });
  });

  it('keeps every slice when there are exactly as many as allowed', () => {
    const slices = donutSlices([item('a', 5), item('b', 4), item('c', 3)], 3);
    expect(slices.map((s) => s.key)).toEqual(['a', 'b', 'c']);
  });

  it('merges the smallest into "Other" when there are too many, never exceeding the limit', () => {
    const slices = donutSlices(
      [item('a', 50), item('b', 30), item('c', 10), item('d', 6), item('e', 4)],
      3,
    );
    expect(slices.map((s) => s.key)).toEqual(['a', 'b', OTHER_KEY]);
    expect(slices[2]).toMatchObject({ label: 'Other', amount: 20 });
    expect(slices.reduce((sum, s) => sum + s.amount, 0)).toBe(100);
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10);
  });

  it('keeps "Other" last even when it is bigger than the others', () => {
    const slices = donutSlices([item('a', 10), item('b', 9), item('c', 9), item('d', 9)], 2);
    expect(slices.map((s) => s.key)).toEqual(['a', OTHER_KEY]);
    expect(slices[1]!.amount).toBe(27);
  });

  it('orders equal amounts by label so the result is stable', () => {
    const slices = donutSlices([item('b', 10), item('a', 10)], 6);
    expect(slices.map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('refuses negative or fractional amounts and a silly limit', () => {
    expect(() => donutSlices([item('a', -1)], 6)).toThrow(RangeError);
    expect(() => donutSlices([item('a', 1.5)], 6)).toThrow(RangeError);
    expect(() => donutSlices([item('a', 1)], 1)).toThrow(RangeError);
    expect(() => donutSlices([item('a', 1)], 2.5)).toThrow(RangeError);
  });

  it('does not change what it is given', () => {
    const items = [item('b', 1), item('a', 2)];
    const before = JSON.stringify(items);
    donutSlices(items, 6);
    expect(JSON.stringify(items)).toBe(before);
  });
});
