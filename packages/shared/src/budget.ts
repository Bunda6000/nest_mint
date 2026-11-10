import { z } from 'zod';

/** A year as "2026", from 2000 on, as in the `?year=` of the budget grid. */
export const yearSchema = z
  .string({ error: 'Choose a year' })
  .regex(/^\d{4}$/, 'Choose a valid year')
  .transform(Number)
  .refine((value) => value >= 2000, 'Choose a year after 1999');

/** One category group's amount in one month ("YYYY-MM"), whole denars. Used between API layers. */
export interface GroupMonthTotal {
  month: string;
  groupId: string;
  groupName: string;
  amountMkd: number;
}

/** Planned against actual; `plannedMkd` is null when nothing is planned (shown as "—"). */
export interface BudgetCellResponse {
  plannedMkd: number | null;
  /** Whole denars, paid by the date of the payment (cash view). */
  actualMkd: number;
}

export interface BudgetGroupResponse {
  groupId: string;
  groupName: string;
  /** January first; always 12. */
  months: BudgetCellResponse[];
  total: BudgetCellResponse;
}

/** The budget grid of one year (the Буџет sheet): groups by twelve months, cash view. */
export interface BudgetGridResponse {
  year: number;
  /** "YYYY-01" to "YYYY-12". */
  months: string[];
  incomeMkd: number[];
  incomeTotalMkd: number;
  groups: BudgetGroupResponse[];
  /** Column totals of all groups. */
  expenses: BudgetCellResponse[];
  expensesTotal: BudgetCellResponse;
  /** Income minus actual expenses. */
  netMkd: number[];
  netTotalMkd: number;
  /** Net ÷ income as a fraction; null when there was no income. */
  savingsRate: (number | null)[];
  savingsRateTotal: number | null;
}
