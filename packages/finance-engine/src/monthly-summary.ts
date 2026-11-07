import { assertMoney, type Money } from './money';

export interface MonthlySummary {
  income: Money;
  expenses: Money;
  net: Money;
  /** Net ÷ income, as a fraction (0.25 = 25%). Null when income is 0 (shown as "—"). */
  savingsRate: number | null;
}

/** Cash-view month summary: income and expenses by paid date (business rules BR-01 to BR-04). */
export function monthlySummary(income: Money, expenses: Money): MonthlySummary {
  assertMoney(income, 'income');
  assertMoney(expenses, 'expenses');
  if (income < 0 || expenses < 0) {
    throw new RangeError('income and expenses must not be negative');
  }
  const net = income - expenses;
  return { income, expenses, net, savingsRate: income === 0 ? null : net / income };
}
