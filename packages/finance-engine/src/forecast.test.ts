import { describe, expect, it } from 'vitest';
import { compareScenario, forecast, usualSpending, type ForecastInput } from './forecast.js';
import type { IncomeSource } from './monthly-totals.js';

const salary: IncomeSource = {
  recurrence: 'monthly',
  amountMkd: 100_000,
  startMonth: '2026-01',
  endMonth: null,
  receivedOn: null,
};

const input: ForecastInput = {
  startMonth: '2026-11',
  months: 3,
  sources: [salary],
  usualExpensesMkd: 70_000,
  startingBalanceMkd: 50_000,
};

describe('usualSpending', () => {
  it('averages and rounds, 0 for nothing', () => {
    expect(usualSpending([60_000, 70_000, 71_001])).toBe(67_000);
    expect(usualSpending([])).toBe(0);
  });
});

describe('forecast', () => {
  it('projects income, spending, net, running total and balance month by month', () => {
    const f = forecast(input);
    expect(f.months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(f.months.map((m) => m.net)).toEqual([30_000, 30_000, 30_000]);
    expect(f.months.map((m) => m.cumulativeNet)).toEqual([30_000, 60_000, 90_000]);
    expect(f.months.map((m) => m.balance)).toEqual([80_000, 110_000, 140_000]);
    expect(f).toMatchObject({
      totalIncome: 300_000,
      totalExpenses: 210_000,
      totalNet: 90_000,
      endBalance: 140_000,
      averageNet: 30_000,
    });
  });

  it('stops a salary at its end month and includes a future one-off', () => {
    const f = forecast({
      ...input,
      sources: [
        { ...salary, endMonth: '2026-11' },
        {
          recurrence: 'one_off',
          amountMkd: 20_000,
          startMonth: null,
          endMonth: null,
          receivedOn: '2027-01-15',
        },
      ],
    });
    expect(f.months.map((m) => m.income)).toEqual([100_000, 0, 20_000]);
  });

  it('has no balance without a starting balance', () => {
    const f = forecast({ ...input, startingBalanceMkd: null });
    expect(f.endBalance).toBeNull();
    expect(f.months[0]!.balance).toBeNull();
  });

  it('applies an income change and a spending change, never spending below 0', () => {
    const f = forecast(input, { incomeChange: 0.1, expenseChangeMkd: -20_000 });
    expect(f.months[0]).toMatchObject({ income: 110_000, expenses: 50_000, net: 60_000 });
    expect(forecast(input, { expenseChangeMkd: -999_999 }).months[0]!.expenses).toBe(0);
  });

  it('rejects a bad horizon or an income drop over 100 %', () => {
    expect(() => forecast({ ...input, months: 0 })).toThrow(RangeError);
    expect(() => forecast({ ...input, months: 61 })).toThrow(RangeError);
    expect(() => forecast({ ...input, months: 1.5 })).toThrow(RangeError);
    expect(() => forecast(input, { incomeChange: -1.2 })).toThrow(RangeError);
  });
});

describe('compareScenario', () => {
  it('"spend 100 less a month" saves 100 × months', () => {
    const c = compareScenario({ ...input, months: 12 }, { expenseChangeMkd: -100 });
    expect(c.extraSavedMkd).toBe(1_200);
    expect(c.extraPerMonthMkd).toBe(100);
    expect(c.scenario.endBalance! - c.baseline.endBalance!).toBe(1_200);
  });
});
