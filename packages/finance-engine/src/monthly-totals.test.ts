import { describe, expect, it } from 'vitest';
import { type IncomeSource, incomeInMonth, monthlyTotals } from './monthly-totals.js';

const salary = (over: Partial<IncomeSource> = {}): IncomeSource => ({
  recurrence: 'monthly',
  amountMkd: 100_000,
  receivedOn: null,
  startMonth: '2026-01',
  endMonth: null,
  ...over,
});

const oneOff = (over: Partial<IncomeSource> = {}): IncomeSource => ({
  recurrence: 'one_off',
  amountMkd: 30_000,
  receivedOn: '2026-11-03',
  startMonth: null,
  endMonth: null,
  ...over,
});

describe('incomeInMonth: a monthly salary', () => {
  it('counts in its first month and in every month after, while it goes on', () => {
    const sources = [salary({ startMonth: '2026-03' })];
    expect(incomeInMonth(sources, '2026-03')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-04')).toBe(100_000);
    expect(incomeInMonth(sources, '2030-12')).toBe(100_000);
  });

  it('does not count before its first month', () => {
    expect(incomeInMonth([salary({ startMonth: '2026-03' })], '2026-02')).toBe(0);
  });

  it('counts in its last month, and not after', () => {
    const sources = [salary({ startMonth: '2026-03', endMonth: '2026-08' })];
    expect(incomeInMonth(sources, '2026-08')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-09')).toBe(0);
    expect(incomeInMonth(sources, '2027-08')).toBe(0);
  });

  it('counts once for a salary that starts and ends in the same month', () => {
    const sources = [salary({ startMonth: '2026-05', endMonth: '2026-05' })];
    expect(incomeInMonth(sources, '2026-04')).toBe(0);
    expect(incomeInMonth(sources, '2026-05')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-06')).toBe(0);
  });

  it('follows the calendar across a year boundary', () => {
    const sources = [salary({ startMonth: '2025-12', endMonth: '2026-01' })];
    expect(incomeInMonth(sources, '2025-11')).toBe(0);
    expect(incomeInMonth(sources, '2025-12')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-01')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-02')).toBe(0);
    expect(incomeInMonth([salary({ startMonth: '2026-01' })], '2025-12')).toBe(0);
  });
});

describe('incomeInMonth: one-off income', () => {
  it('counts only in the month it arrived', () => {
    const sources = [oneOff({ receivedOn: '2026-11-03' })];
    expect(incomeInMonth(sources, '2026-10')).toBe(0);
    expect(incomeInMonth(sources, '2026-11')).toBe(30_000);
    expect(incomeInMonth(sources, '2026-12')).toBe(0);
    expect(incomeInMonth(sources, '2027-11')).toBe(0);
  });

  it('puts the last and first day of a month in the right months', () => {
    const sources = [
      oneOff({ amountMkd: 1, receivedOn: '2026-11-30' }),
      oneOff({ amountMkd: 10, receivedOn: '2026-12-01' }),
    ];
    expect(incomeInMonth(sources, '2026-11')).toBe(1);
    expect(incomeInMonth(sources, '2026-12')).toBe(10);
  });
});

describe('incomeInMonth: several sources', () => {
  it('adds up everything that belongs to the month', () => {
    const sources = [
      salary({ amountMkd: 100_000 }),
      salary({ amountMkd: 20_000, startMonth: '2026-06' }),
      oneOff({ amountMkd: 5_000, receivedOn: '2026-07-15' }),
      oneOff({ amountMkd: 700, receivedOn: '2026-07-28' }),
      oneOff({ amountMkd: 99, receivedOn: '2026-08-01' }),
    ];
    expect(incomeInMonth(sources, '2026-05')).toBe(100_000);
    expect(incomeInMonth(sources, '2026-07')).toBe(100_000 + 20_000 + 5_000 + 700);
    expect(incomeInMonth(sources, '2026-08')).toBe(100_000 + 20_000 + 99);
  });

  it('counts each month once when a salary is replaced by a raise', () => {
    const sources = [
      salary({ amountMkd: 100_000, startMonth: '2026-01', endMonth: '2026-05' }),
      salary({ amountMkd: 120_000, startMonth: '2026-06' }),
    ];
    const year = Array.from({ length: 12 }, (_, i) =>
      incomeInMonth(sources, `2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(year).toEqual([...Array<number>(5).fill(100_000), ...Array<number>(7).fill(120_000)]);
  });

  it('is 0 with no income, and does not change its input', () => {
    expect(incomeInMonth([], '2026-11')).toBe(0);
    const sources = [salary(), oneOff()];
    const before = JSON.stringify(sources);
    incomeInMonth(sources, '2026-11');
    expect(JSON.stringify(sources)).toBe(before);
  });
});

describe('incomeInMonth: refuses bad input', () => {
  it.each(['2026-13', '2026-00', '2026-1', '2026', '', '2026-11-01', 'nov 2026'])(
    'a month of %j',
    (month) => {
      expect(() => incomeInMonth([], month)).toThrow(RangeError);
    },
  );

  it('refuses monthly income without a start month or with a bad month', () => {
    expect(() => incomeInMonth([salary({ startMonth: null })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([salary({ startMonth: '2026-13' })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([salary({ endMonth: 'soon' })], '2026-11')).toThrow(RangeError);
  });

  it('refuses an end month before the start month, even for a month outside the range', () => {
    const wrong = salary({ startMonth: '2026-06', endMonth: '2026-02' });
    expect(() => incomeInMonth([wrong], '2026-04')).toThrow(RangeError);
    expect(() => incomeInMonth([wrong], '2020-01')).toThrow(RangeError);
  });

  it('refuses one-off income without a date or with a bad date', () => {
    expect(() => incomeInMonth([oneOff({ receivedOn: null })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([oneOff({ receivedOn: '2026-11' })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([oneOff({ receivedOn: 'yesterday' })], '2026-11')).toThrow(
      RangeError,
    );
  });

  it('refuses fractions and negative amounts, even in a month where they would not count', () => {
    expect(() => incomeInMonth([salary({ amountMkd: 100.5 })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([salary({ amountMkd: -1 })], '2026-11')).toThrow(RangeError);
    expect(() => incomeInMonth([oneOff({ amountMkd: -1 })], '2020-01')).toThrow(RangeError);
  });

  it('refuses an unknown recurrence', () => {
    const odd = { ...salary(), recurrence: 'weekly' } as unknown as IncomeSource;
    expect(() => incomeInMonth([odd], '2026-11')).toThrow(RangeError);
  });
});

describe('monthlyTotals', () => {
  it('matches Budget.xlsx January 2025 (income 146,308, tracked expenses 82,272)', () => {
    const totals = monthlyTotals(
      '2025-01',
      [salary({ amountMkd: 146_308, startMonth: '2024-06' })],
      82_272,
    );
    expect(totals).toMatchObject({
      month: '2025-01',
      income: 146_308,
      expenses: 82_272,
      net: 64_036,
    });
    expect(totals.savingsRate).toBeCloseTo(0.4377, 4);
  });

  it('combines salary and one-off income with the month expenses', () => {
    const totals = monthlyTotals('2026-11', [salary(), oneOff()], 40_000);
    expect(totals).toEqual({
      month: '2026-11',
      income: 130_000,
      expenses: 40_000,
      net: 90_000,
      savingsRate: 90_000 / 130_000,
    });
  });

  it('has no savings rate when nothing came in, but still shows the spending', () => {
    const totals = monthlyTotals('2026-11', [], 12_000);
    expect(totals).toEqual({
      month: '2026-11',
      income: 0,
      expenses: 12_000,
      net: -12_000,
      savingsRate: null,
    });
  });

  it('shows a negative net and savings rate when more is spent than earned', () => {
    const totals = monthlyTotals('2026-11', [salary({ amountMkd: 10_000 })], 12_500);
    expect(totals.net).toBe(-2_500);
    expect(totals.savingsRate).toBe(-0.25);
  });

  it('saves everything in a month with no expenses', () => {
    expect(monthlyTotals('2026-11', [salary()], 0)).toMatchObject({ net: 100_000, savingsRate: 1 });
  });

  it('is all zero for an empty month', () => {
    expect(monthlyTotals('2026-11', [], 0)).toEqual({
      month: '2026-11',
      income: 0,
      expenses: 0,
      net: 0,
      savingsRate: null,
    });
  });

  it('refuses a bad month and bad expenses', () => {
    expect(() => monthlyTotals('2026-13', [], 0)).toThrow(RangeError);
    expect(() => monthlyTotals('2026-11', [], -1)).toThrow(RangeError);
    expect(() => monthlyTotals('2026-11', [], 1.5)).toThrow(RangeError);
  });
});
