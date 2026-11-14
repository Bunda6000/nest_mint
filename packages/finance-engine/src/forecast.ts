import { shiftMonth } from './insights.js';
import { assertMoney, type Money } from './money.js';
import { type IncomeSource, incomeInMonth } from './monthly-totals.js';

/** Horizons the app offers; any whole number from 1 to {@link MAX_FORECAST_MONTHS} is accepted. */
export const FORECAST_HORIZONS = [3, 6, 12, 24] as const;
export const MAX_FORECAST_MONTHS = 60;
/** How many complete past months the usual spending is averaged over. */
export const BASELINE_MONTHS = 3;

export interface ForecastInput {
  /** The first month of the forecast, "YYYY-MM" (the running month). */
  startMonth: string;
  /** How many months, 1 to {@link MAX_FORECAST_MONTHS}. */
  months: number;
  /** Income as entered: monthly salaries that run on, and one-off income with a future date. */
  sources: readonly IncomeSource[];
  /** What is spent in a usual month, whole denars. See {@link usualSpending}. */
  usualExpensesMkd: Money;
  /** The balance of the main account before the first forecast month; null if unknown. */
  startingBalanceMkd: Money | null;
}

/** A what-if: every field is optional and leaves that part as it is. */
export interface Adjustments {
  /** 0.1 = income 10 % higher every month, −0.2 = 20 % lower. */
  incomeChange?: number;
  /** Added to the usual monthly spending: −200 spends 200 less each month. */
  expenseChangeMkd?: Money;
}

export interface ForecastMonth {
  month: string;
  income: Money;
  expenses: Money;
  net: Money;
  /** Net of this month and every forecast month before it. */
  cumulativeNet: Money;
  /** Balance at the end of the month; null when the starting balance is unknown. */
  balance: Money | null;
}

export interface Forecast {
  months: ForecastMonth[];
  totalIncome: Money;
  totalExpenses: Money;
  totalNet: Money;
  /** Balance after the last month; null when the starting balance is unknown. */
  endBalance: Money | null;
  /** The average net per month over the forecast. */
  averageNet: Money;
}

/**
 * The usual month's spending: the average of the given complete months, rounded. An empty list gives 0.
 * The caller passes the last {@link BASELINE_MONTHS} complete months.
 */
export function usualSpending(pastExpenses: readonly Money[]): Money {
  if (pastExpenses.length === 0) return 0;
  pastExpenses.forEach((v) => assertMoney(v, 'expenses'));
  return Math.round(pastExpenses.reduce((t, v) => t + v, 0) / pastExpenses.length);
}

/**
 * Month by month projection (NM-60). Income is what is entered for each month (salaries run on
 * until their end month); spending is the usual month, every month. Nothing is guessed beyond that,
 * so the result says "if things stay as they are".
 */
export function forecast(input: ForecastInput, adjustments: Adjustments = {}): Forecast {
  const { startMonth, months, sources, usualExpensesMkd, startingBalanceMkd } = input;
  if (!Number.isInteger(months) || months < 1 || months > MAX_FORECAST_MONTHS) {
    throw new RangeError(`months must be a whole number from 1 to ${MAX_FORECAST_MONTHS}`);
  }
  assertMoney(usualExpensesMkd, 'usualExpensesMkd');
  const incomeFactor = 1 + (adjustments.incomeChange ?? 0);
  if (incomeFactor < 0) throw new RangeError('income cannot fall by more than 100 %');
  const expenses = Math.max(0, usualExpensesMkd + (adjustments.expenseChangeMkd ?? 0));

  let cumulative = 0;
  const rows: ForecastMonth[] = [];
  for (let i = 0; i < months; i++) {
    const month = shiftMonth(startMonth, i);
    const income = Math.round(incomeInMonth(sources, month) * incomeFactor);
    const net = income - expenses;
    cumulative += net;
    rows.push({
      month,
      income,
      expenses,
      net,
      cumulativeNet: cumulative,
      balance: startingBalanceMkd === null ? null : startingBalanceMkd + cumulative,
    });
  }
  const totalIncome = rows.reduce((t, r) => t + r.income, 0);
  return {
    months: rows,
    totalIncome,
    totalExpenses: expenses * months,
    totalNet: cumulative,
    endBalance: rows.at(-1)!.balance,
    averageNet: Math.round(cumulative / months),
  };
}

export interface ScenarioComparison {
  baseline: Forecast;
  scenario: Forecast;
  /** scenario − baseline after the last month. */
  extraSavedMkd: Money;
  /** scenario − baseline per month, on average; what a goal could receive extra each month. */
  extraPerMonthMkd: Money;
}

/** The forecast as it is and with the what-if applied, and the difference (NM-61). */
export function compareScenario(
  input: ForecastInput,
  adjustments: Adjustments,
): ScenarioComparison {
  const baseline = forecast(input);
  const scenario = forecast(input, adjustments);
  return {
    baseline,
    scenario,
    extraSavedMkd: scenario.totalNet - baseline.totalNet,
    extraPerMonthMkd: scenario.averageNet - baseline.averageNet,
  };
}
