import { assertMoney, type Money } from './money.js';
import type { MonthlySummary } from './monthly-summary.js';

/** How an amount moved from one month to the next. */
export interface AmountChange {
  /** This month minus the previous one, in whole denars. */
  amount: Money;
  /**
   * `amount` ÷ the size of the previous month's value (0.08 = up 8%). Null when the previous value
   * was 0, as a percentage of nothing says nothing. Measured against the size, not the sign, so a
   * net that goes from −100 to +50 is +150%: an improvement.
   */
  ratio: number | null;
}

export interface MonthComparison {
  income: AmountChange;
  expenses: AmountChange;
  net: AmountChange;
  /**
   * This month's savings rate minus the previous one, as a fraction (0.042 = up 4.2 percentage
   * points). Null when either month had no income, so no rate.
   */
  savingsRate: number | null;
}

/** The change of one amount against the previous month's. */
export function amountChange(current: Money, previous: Money): AmountChange {
  assertMoney(current, 'current');
  assertMoney(previous, 'previous');
  const amount = current - previous;
  return { amount, ratio: previous === 0 ? null : amount / Math.abs(previous) };
}

/** Income, expenses, net and savings rate of a month against the month before it. */
export function compareMonths(current: MonthlySummary, previous: MonthlySummary): MonthComparison {
  return {
    income: amountChange(current.income, previous.income),
    expenses: amountChange(current.expenses, previous.expenses),
    net: amountChange(current.net, previous.net),
    savingsRate:
      current.savingsRate === null || previous.savingsRate === null
        ? null
        : current.savingsRate - previous.savingsRate,
  };
}
