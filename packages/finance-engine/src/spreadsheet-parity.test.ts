import { describe, expect, it } from 'vitest';
import { budgetGrid, type GroupMonthAmount } from './budget-grid.js';
import { installmentPlan, installmentProgress } from './installments.js';
import type { IncomeSource } from './monthly-totals.js';

/**
 * Spreadsheet parity (NM-7). The figures below are copied from Filip's Budget.xlsx, sheet «Буџет»,
 * January to June 2025 (cell values as Excel last calculated them). Feeding the same lines to the
 * engine must give the same totals as the sheet, so the sheet can be retired with confidence.
 *
 * Each line lists January..June. A blank cell in the sheet is 0.
 */
const SHEET: Record<string, { lines: Record<string, number[]>; sheetTotals: number[] | null }> = {
  Банки: {
    lines: {
      Станбен: [15_437, 0, 15_500, 15_453, 15_509, 15_500],
      Потрошувачки: [0, 0, 0, 0, 0, 0],
      Кеш: [1_900, 0, 0, 0, 0, 0],
    },
    sheetTotals: [17_337, 0, 15_500, 15_453, 15_509, 15_500],
  },
  Дома: {
    lines: {
      Струја: [3_460, 4_881, 7_531, 11_750, 6_929, 6_358],
      Вода: [705, 705, 705, 0, 705, 1_410],
      Оператор: [3_317, 3_050, 2_932, 2_990, 2_708, 2_865],
      'Куќен Совет': [0, 0, 726, 731, 1_533, 0],
      Кирби: [3_075, 3_075, 3_075, 3_075, 0, 0],
      Осигурување: [1_000, 0, 0, 0, 0, 0],
      Разно: [11_989, 0, 0, 0, 0, 0],
    },
    sheetTotals: [23_546, 11_711, 14_969, 18_546, 11_875, 10_633],
  },
  Дете: {
    lines: {
      Градинка: [19_500, 19_500, 19_500, 17_550, 17_950, 19_500],
      Останато: [0, 0, 0, 0, 0, 0],
    },
    sheetTotals: [19_500, 19_500, 19_500, 17_550, 17_950, 19_500],
  },
  Транспорт: {
    lines: {
      Гориво: [4_200, 0, 0, 0, 0, 0],
      Регистрација: [0, 0, 0, 0, 0, 0],
      Осигурување: [884, 884, 884, 884, 884, 884],
      'Зелен картон': [503, 503, 503, 503, 503, 503],
      Каско: [2_854, 2_854, 2_854, 2_854, 2_854, 2_854],
      'Гуми + Чувањ': [5_350, 5_350, 5_350, 5_350, 5_350, 5_350],
    },
    sheetTotals: [13_791, 9_591, 9_591, 9_591, 9_591, 9_591],
  },
  Забава: {
    lines: { Стриминг: [1_790, 0, 0, 0, 0, 0], Google: [871, 0, 0, 0, 0, 0] },
    sheetTotals: [2_661, 0, 0, 0, 0, 0],
  },
  // The sheet has no total row for Online; the lines still count as spending.
  Online: {
    lines: { Udemy: [597, 0, 0, 0, 0, 0], Тему: [862, 0, 0, 0, 0, 0] },
    sheetTotals: null,
  },
  Останато: {
    lines: { Облека: [3_978, 0, 0, 0, 0, 0] },
    sheetTotals: [3_978, 0, 0, 0, 0, 0],
  },
};

// Приходи: the salary runs January to October; «Друго» is a one-off in January.
const INCOME: IncomeSource[] = [
  {
    recurrence: 'monthly',
    amountMkd: 127_088,
    receivedOn: null,
    startMonth: '2025-01',
    endMonth: '2025-10',
  },
  {
    recurrence: 'one_off',
    amountMkd: 19_220,
    receivedOn: '2025-01-15',
    startMonth: null,
    endMonth: null,
  },
];
const SHEET_INCOME = [146_308, 127_088, 127_088, 127_088, 127_088, 127_088];

const groups = Object.keys(SHEET).map((name) => ({ id: name, name }));
const actual: GroupMonthAmount[] = Object.entries(SHEET).flatMap(([groupId, { lines }]) =>
  Object.values(lines).flatMap((values) =>
    values.map((amount, i) => ({ month: `2025-0${i + 1}`, groupId, amount })),
  ),
);

const grid = budgetGrid({ year: 2025, groups, income: INCOME, actual, planned: [] });
const firstHalf = <T>(values: readonly T[]) => values.slice(0, 6);
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe('spreadsheet parity: Буџет, January to June 2025', () => {
  it('reproduces the income rows (Прилив → Вкупно)', () => {
    expect(firstHalf(grid.income)).toEqual(SHEET_INCOME);
  });

  it.each(Object.entries(SHEET).filter(([, v]) => v.sheetTotals))(
    'reproduces the monthly totals of %s (Вкупно)',
    (name, { sheetTotals }) => {
      const row = grid.groups.find((g) => g.name === name)!;
      expect(firstHalf(row.months).map((c) => c.actual)).toEqual(sheetTotals);
    },
  );

  it('counts Online, which has no total row in the sheet, as its lines add up', () => {
    const row = grid.groups.find((g) => g.name === 'Online')!;
    expect(firstHalf(row.months).map((c) => c.actual)).toEqual([1_459, 0, 0, 0, 0, 0]);
  });

  it('adds every group together per month, and income less spending is the net', () => {
    const expected = [0, 1, 2, 3, 4, 5].map((i) =>
      sum(Object.values(SHEET).flatMap((g) => Object.values(g.lines).map((l) => l[i]!))),
    );
    expect(firstHalf(grid.expenses).map((c) => c.actual)).toEqual(expected);
    expect(firstHalf(grid.net)).toEqual(SHEET_INCOME.map((income, i) => income - expected[i]!));
    // January: 146,308 income, 17,337 + 23,546 + 19,500 + 13,791 + 2,661 + 1,459 + 3,978 spent.
    expect(expected[0]).toBe(82_272);
    expect(grid.net[0]).toBe(64_036);
  });

  it('keeps row totals and column totals in agreement', () => {
    expect(sum(grid.groups.map((g) => g.total.actual))).toBe(grid.expensesTotal.actual);
  });
});

describe('spreadsheet parity: Кирби', () => {
  // Sheet «Кирби»: 153,750 total, first installment 5,500, regular 3,075; 28 installments paid
  // (88,525), so «Остаток» is 65,225.
  const plan = installmentPlan(153_750, 5_500, 3_075);
  const paid = [5_500, ...Array<number>(27).fill(3_075)];

  it('has 28 paid installments adding up to 88,525', () => {
    expect(sum(paid)).toBe(88_525);
  });

  it('leaves 65,225 remaining and 22 installments', () => {
    expect(installmentProgress(plan, paid)).toEqual({ remainingMkd: 65_225, installmentsLeft: 22 });
  });

  it('matches the regular installment the Буџет sheet shows for January to April 2025', () => {
    expect(SHEET['Дома']!.lines['Кирби']!.slice(0, 4)).toEqual([3_075, 3_075, 3_075, 3_075]);
    expect(plan.amounts[1]).toBe(3_075);
  });
});
