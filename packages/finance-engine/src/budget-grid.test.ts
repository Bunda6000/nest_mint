import { describe, expect, it } from 'vitest';
import { budgetGrid, type GroupMonthAmount } from './budget-grid.js';
import type { IncomeSource } from './monthly-totals.js';

const groups = [
  { id: 'banks', name: 'Банки' },
  { id: 'home', name: 'Дома' },
  { id: 'kid', name: 'Дете' },
];

const salary = (amountMkd: number, startMonth = '2025-01', endMonth: string | null = null) =>
  ({ recurrence: 'monthly', amountMkd, receivedOn: null, startMonth, endMonth }) as IncomeSource;

const oneOff = (amountMkd: number, receivedOn: string) =>
  ({
    recurrence: 'one_off',
    amountMkd,
    receivedOn,
    startMonth: null,
    endMonth: null,
  }) as IncomeSource;

const amount = (month: string, groupId: string, value: number): GroupMonthAmount => ({
  month,
  groupId,
  amount: value,
});

function grid(over: Partial<Parameters<typeof budgetGrid>[0]> = {}) {
  return budgetGrid({ year: 2025, groups, income: [], actual: [], planned: [], ...over });
}

describe('budgetGrid', () => {
  it('has twelve months, January first, and a row per group in the order given', () => {
    const g = grid();
    expect(g.months[0]).toBe('2025-01');
    expect(g.months[11]).toBe('2025-12');
    expect(g.groups.map((r) => r.name)).toEqual(['Банки', 'Дома', 'Дете']);
    expect(g.groups.every((r) => r.months.length === 12)).toBe(true);
  });

  it('is all zero, with no plan and no savings rate, when there is nothing', () => {
    const g = grid();
    expect(g.incomeTotal).toBe(0);
    expect(g.expensesTotal).toEqual({ planned: null, actual: 0 });
    expect(g.netTotal).toBe(0);
    expect(g.savingsRate).toEqual(Array(12).fill(null));
    expect(g.savingsRateTotal).toBeNull();
  });

  it('puts actual spending in the right group and month, and adds row and column totals', () => {
    const g = grid({
      actual: [
        amount('2025-01', 'banks', 15_437),
        amount('2025-01', 'home', 3_460),
        amount('2025-01', 'home', 705),
        amount('2025-02', 'home', 4_881),
        amount('2025-02', 'kid', 19_500),
      ],
    });
    const home = g.groups[1]!;
    expect(home.months[0]!.actual).toBe(4_165);
    expect(home.months[1]!.actual).toBe(4_881);
    expect(home.total.actual).toBe(9_046);
    expect(g.expenses[0]!.actual).toBe(15_437 + 4_165);
    expect(g.expenses[1]!.actual).toBe(4_881 + 19_500);
    expect(g.expensesTotal.actual).toBe(15_437 + 9_046 + 19_500);
  });

  it('keeps "no plan" apart from a plan of 0 and totals only what is planned', () => {
    const g = grid({
      planned: [amount('2025-03', 'home', 5_000), amount('2025-04', 'home', 0)],
    });
    const home = g.groups[1]!;
    expect(home.months[0]!.planned).toBeNull();
    expect(home.months[2]!.planned).toBe(5_000);
    expect(home.months[3]!.planned).toBe(0);
    expect(home.total.planned).toBe(5_000);
    expect(g.groups[0]!.total.planned).toBeNull();
    expect(g.expenses[2]!.planned).toBe(5_000);
    expect(g.expensesTotal.planned).toBe(5_000);
  });

  it('shows planned and actual side by side without mixing them', () => {
    const g = grid({
      planned: [amount('2025-01', 'home', 3_000)],
      actual: [amount('2025-01', 'home', 3_460)],
    });
    expect(g.groups[1]!.months[0]).toEqual({ planned: 3_000, actual: 3_460 });
  });

  it('works out income by schedule, net as income minus actual expenses, and the savings rate', () => {
    const g = grid({
      income: [salary(127_088), oneOff(19_220, '2025-01-15')],
      actual: [amount('2025-01', 'banks', 20_000), amount('2025-02', 'banks', 127_088 + 1_000)],
    });
    expect(g.income[0]).toBe(146_308);
    expect(g.income[1]).toBe(127_088);
    expect(g.net[0]).toBe(126_308);
    expect(g.net[1]).toBe(-1_000);
    expect(g.savingsRate[0]).toBeCloseTo(126_308 / 146_308);
    expect(g.savingsRate[1]).toBeLessThan(0);
    expect(g.incomeTotal).toBe(146_308 + 127_088 * 11);
    expect(g.netTotal).toBe(g.incomeTotal - g.expensesTotal.actual);
  });

  it('counts a salary only in the months it runs', () => {
    const g = grid({ income: [salary(100_000, '2025-03', '2025-05')] });
    expect(g.income.map((v) => v > 0)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('shows "—" (null) for the savings rate of a month without income', () => {
    const g = grid({
      income: [salary(100_000, '2025-02')],
      actual: [amount('2025-01', 'home', 50)],
    });
    expect(g.savingsRate[0]).toBeNull();
    expect(g.savingsRate[1]).toBe(1);
  });

  it('has the totals of the rows and of the columns agree', () => {
    const g = grid({
      actual: [
        amount('2025-01', 'banks', 1),
        amount('2025-05', 'kid', 20),
        amount('2025-12', 'home', 300),
      ],
      planned: [amount('2025-05', 'kid', 25), amount('2025-06', 'banks', 7)],
    });
    const byRows = g.groups.reduce((sum, r) => sum + r.total.actual, 0);
    const byColumns = g.expenses.reduce((sum, c) => sum + c.actual, 0);
    expect(byRows).toBe(321);
    expect(byColumns).toBe(321);
    expect(g.expensesTotal.planned).toBe(32);
  });

  it('refuses amounts it cannot place or trust', () => {
    expect(() => grid({ actual: [amount('2025-01', 'ghost', 10)] })).toThrow(RangeError);
    expect(() => grid({ actual: [amount('2024-12', 'home', 10)] })).toThrow(RangeError);
    expect(() => grid({ actual: [amount('2025-01', 'home', -1)] })).toThrow(RangeError);
    expect(() => grid({ planned: [amount('2025-01', 'home', 1.5)] })).toThrow(RangeError);
    expect(() => grid({ year: 1999 })).toThrow(RangeError);
    expect(() => grid({ year: 2025.5 })).toThrow(RangeError);
  });
});
