import { assertMoney, type Money } from './money.js';
import { type IncomeSource, incomeInMonth } from './monthly-totals.js';

/** An amount of one category group in one month ("YYYY-MM"). Whole denars, 0 or more. */
export interface GroupMonthAmount {
  month: string;
  groupId: string;
  amount: Money;
}

export interface GridGroup {
  id: string;
  name: string;
}

/**
 * Planned against actual. `planned` is null when nothing is planned (no bill is expected), which the
 * screen shows as "—": a group without a plan is not the same as a plan of 0.
 */
export interface GridCell {
  planned: Money | null;
  actual: Money;
}

export interface BudgetGridGroup extends GridGroup {
  /** The twelve months of the year, January first. */
  months: GridCell[];
  total: GridCell;
}

/** The Буџет sheet as data: twelve months of one year, cash view (by paid date). */
export interface BudgetGrid {
  year: number;
  /** "YYYY-01" to "YYYY-12". */
  months: string[];
  /** Income per month and for the year (by schedule, like the monthly totals). */
  income: Money[];
  incomeTotal: Money;
  /** One row per group, in the order given. */
  groups: BudgetGridGroup[];
  /** Column totals: all groups together. */
  expenses: GridCell[];
  expensesTotal: GridCell;
  /** Income minus actual expenses. */
  net: Money[];
  netTotal: Money;
  /** Net ÷ income as a fraction; null when income is 0. */
  savingsRate: (number | null)[];
  savingsRateTotal: number | null;
}

const rate = (net: Money, income: Money): number | null => (income === 0 ? null : net / income);

function addPlanned(a: Money | null, b: Money | null): Money | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

/**
 * Builds the budget grid of one year.
 *
 * `actual` is what was spent (paid transactions, cash withdrawals included) and `planned` what is
 * expected to be paid (bills' expected amounts), both per group and month; entries of the same group
 * and month are added together, a missing one counts as nothing. Every group id in the amounts
 * must be in `groups`, otherwise the totals would not add up, so that is an error.
 */
export function budgetGrid(input: {
  year: number;
  groups: readonly GridGroup[];
  income: readonly IncomeSource[];
  actual: readonly GroupMonthAmount[];
  planned: readonly GroupMonthAmount[];
}): BudgetGrid {
  const { year, groups } = input;
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`year must be a whole year from 2000, got ${year}`);
  }
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const groupIds = new Set(groups.map((g) => g.id));

  const collect = (amounts: readonly GroupMonthAmount[], label: string) => {
    const byKey = new Map<string, Money>();
    for (const { month, groupId, amount } of amounts) {
      assertMoney(amount, `${label} amount`);
      if (amount < 0) throw new RangeError(`${label} amount must not be negative`);
      if (!groupIds.has(groupId))
        throw new RangeError(`${label} amount of unknown group ${groupId}`);
      if (!months.includes(month))
        throw new RangeError(`${label} amount of ${month} is not in ${year}`);
      const key = `${groupId}|${month}`;
      byKey.set(key, (byKey.get(key) ?? 0) + amount);
    }
    return byKey;
  };
  const actual = collect(input.actual, 'actual');
  const planned = collect(input.planned, 'planned');

  const rows: BudgetGridGroup[] = groups.map((group) => {
    const cells = months.map((month): GridCell => {
      const key = `${group.id}|${month}`;
      return { planned: planned.get(key) ?? null, actual: actual.get(key) ?? 0 };
    });
    const total = cells.reduce<GridCell>(
      (sum, cell) => ({
        planned: addPlanned(sum.planned, cell.planned),
        actual: sum.actual + cell.actual,
      }),
      { planned: null, actual: 0 },
    );
    return { id: group.id, name: group.name, months: cells, total };
  });

  const expenses = months.map((_, i) =>
    rows.reduce<GridCell>(
      (sum, row) => ({
        planned: addPlanned(sum.planned, row.months[i]!.planned),
        actual: sum.actual + row.months[i]!.actual,
      }),
      { planned: null, actual: 0 },
    ),
  );
  const expensesTotal = expenses.reduce<GridCell>(
    (sum, cell) => ({
      planned: addPlanned(sum.planned, cell.planned),
      actual: sum.actual + cell.actual,
    }),
    { planned: null, actual: 0 },
  );

  const income = months.map((month) => incomeInMonth(input.income, month));
  const incomeTotal = income.reduce((sum, value) => sum + value, 0);
  const net = income.map((value, i) => value - expenses[i]!.actual);
  const netTotal = incomeTotal - expensesTotal.actual;

  return {
    year,
    months,
    income,
    incomeTotal,
    groups: rows,
    expenses,
    expensesTotal,
    net,
    netTotal,
    savingsRate: net.map((value, i) => rate(value, income[i]!)),
    savingsRateTotal: rate(netTotal, incomeTotal),
  };
}
