import { assertMoney, type Money } from './money.js';
import { type MonthlySummary, monthlySummary } from './monthly-summary.js';

/**
 * Income as the engine needs it. The API's income records have these fields (and a few more).
 * A monthly salary counts in every month from `startMonth` to `endMonth`, both included; with no
 * `endMonth` it goes on. One-off income counts in the month of `receivedOn`.
 */
export interface IncomeSource {
  recurrence: 'monthly' | 'one_off';
  /** Whole denars. */
  amountMkd: Money;
  /** One-off only, "YYYY-MM-DD". */
  receivedOn: string | null;
  /** Monthly only, "YYYY-MM". */
  startMonth: string | null;
  /** Monthly only, "YYYY-MM"; null while the salary goes on. */
  endMonth: string | null;
}

export interface MonthTotals extends MonthlySummary {
  /** The month these totals are for, "YYYY-MM". */
  month: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

function assertMonth(value: string, field: string): void {
  if (!MONTH.test(value)) {
    throw new RangeError(`${field} must look like "2026-11", got "${value}"`);
  }
}

/**
 * All income that belongs to one calendar month ("YYYY-MM"), by the date it is paid: a monthly
 * salary is paid once in every month it runs, one-off income in the month it arrived.
 */
export function incomeInMonth(sources: readonly IncomeSource[], month: string): Money {
  assertMonth(month, 'month');
  let total = 0;
  for (const source of sources) {
    assertMoney(source.amountMkd, 'income amount');
    if (source.amountMkd < 0) throw new RangeError('income amount must not be negative');

    if (source.recurrence === 'monthly') {
      const { startMonth, endMonth } = source;
      if (startMonth === null) throw new RangeError('monthly income needs a start month');
      assertMonth(startMonth, 'startMonth');
      if (endMonth !== null) {
        assertMonth(endMonth, 'endMonth');
        if (endMonth < startMonth) {
          throw new RangeError('endMonth must not be before startMonth');
        }
      }
      // "YYYY-MM" strings sort in calendar order, also across a year boundary.
      if (startMonth <= month && (endMonth === null || month <= endMonth)) {
        total += source.amountMkd;
      }
    } else if (source.recurrence === 'one_off') {
      const { receivedOn } = source;
      if (receivedOn === null || !DAY.test(receivedOn)) {
        throw new RangeError('one-off income needs a date like "2026-11-03"');
      }
      if (receivedOn.slice(0, 7) === month) total += source.amountMkd;
    } else {
      throw new RangeError(`unknown income recurrence "${String(source.recurrence)}"`);
    }
  }
  return total;
}

/**
 * Cash-view totals of one month: income, expenses, net and savings rate (BR-01 to BR-04).
 * `expenses` is the sum of that month's expenses, cash withdrawals included.
 */
export function monthlyTotals(
  month: string,
  sources: readonly IncomeSource[],
  expenses: Money,
): MonthTotals {
  return { month, ...monthlySummary(incomeInMonth(sources, month), expenses) };
}
