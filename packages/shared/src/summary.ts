/**
 * Cash-view totals of one calendar month, by paid date. Amounts are whole denars; euro amounts
 * are derived by the app, as everywhere (see docs/adr/008-money-and-exchange-rates.md).
 */
export interface MonthSummaryResponse {
  /** "YYYY-MM". */
  month: string;
  /** Monthly salaries that run in the month plus one-off income received in it. */
  incomeMkd: number;
  /** Everything spent in the month, cash withdrawals included. */
  expensesMkd: number;
  /** Income minus expenses; negative when more was spent than came in. */
  netMkd: number;
  /** Net ÷ income as a fraction (0.25 = 25%); null when there was no income (shown as "—"). */
  savingsRate: number | null;
}
