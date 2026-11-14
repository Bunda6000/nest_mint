import type { TransactionResponse } from './transactions.js';

/** How many months the history chart covers, ending at the month asked for. */
export const HISTORY_MONTHS = 12;

/** How many of the biggest transactions the breakdown lists. */
export const TOP_EXPENSES = 5;

/** What was spent in one category in a month. */
export interface CategoryTotalResponse {
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
  /** Whole denars, above 0. */
  amountMkd: number;
}

/** Where one month's spending went: by category, and the biggest single transactions. */
export interface MonthBreakdownResponse {
  /** "YYYY-MM". */
  month: string;
  /** Biggest first. Cash withdrawals count, as in the month's expenses total. */
  categories: CategoryTotalResponse[];
  /** The biggest transactions of the month, biggest first (at most TOP_EXPENSES). */
  top: TransactionResponse[];
}

export interface HistoryMonthResponse {
  /** "YYYY-MM". */
  month: string;
  incomeMkd: number;
  expensesMkd: number;
  netMkd: number;
  /** Net of this and every earlier month in the window; starts from 0 at its first month. */
  cumulativeNetMkd: number;
  /** Net ÷ income as a fraction; null when there was no income. */
  savingsRate: number | null;
}

/** The HISTORY_MONTHS months ending at `month`, oldest first. */
export interface HistoryResponse {
  months: HistoryMonthResponse[];
}

export type SavingsIdeaKind = 'trim' | 'rising' | 'unusual' | 'top';

/** One suggestion from the rules in the finance engine, always with the numbers behind it (NM-70). */
export interface SavingsIdeaResponse {
  id: string;
  kind: SavingsIdeaKind;
  categoryId: string;
  categoryName: string;
  title: string;
  /** Why it was raised. */
  why: string;
  /** How the saving was worked out. */
  method: string;
  /** Per month, 0 for information only. */
  monthlyImpactMkd: number;
  yearlyImpactMkd: number;
}

export interface SavingsIdeasResponse {
  /** The complete months the rules looked at, oldest first. */
  months: string[];
  ideas: SavingsIdeaResponse[];
  /** Sum of the monthly impact of all ideas. */
  totalMonthlyMkd: number;
  totalYearlyMkd: number;
}
