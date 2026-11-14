/** Untracked spending above this share of the period's income raises the alert (NM-31). */
export const UNTRACKED_ALERT_SHARE = 0.1;

export interface BalanceCheckInInput {
  /** What the main account held at the start of the period; may be negative (overdraft). */
  openingMkd: number;
  /** Income of the period, from the schedule. */
  incomeMkd: number;
  /** Expenses of the period, cash withdrawals included. */
  expensesMkd: number;
  /** What the main account really holds at the end of the period, from the bank. */
  closingMkd: number;
}

export interface BalanceCheckInResult {
  /** opening + income − expenses: what the books say the account should hold. */
  expectedMkd: number;
  /**
   * expected − closing. Positive: money left the account that was never recorded (untracked
   * spending). Negative: more money than the books explain (income not recorded).
   */
  untrackedMkd: number;
  /** Untracked spending is more than 10 % of the income (a month without income: any at all). */
  alert: boolean;
}

function assertWhole(value: number, name: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be a whole number of denars`);
}

/** Balance check-in: reconciles the books with the real balance of the main salary account. */
export function balanceCheckIn(input: BalanceCheckInInput): BalanceCheckInResult {
  const { openingMkd, incomeMkd, expensesMkd, closingMkd } = input;
  assertWhole(openingMkd, 'openingMkd');
  assertWhole(incomeMkd, 'incomeMkd');
  assertWhole(expensesMkd, 'expensesMkd');
  assertWhole(closingMkd, 'closingMkd');
  if (incomeMkd < 0 || expensesMkd < 0) {
    throw new RangeError('incomeMkd and expensesMkd must not be negative');
  }
  const expectedMkd = openingMkd + incomeMkd - expensesMkd;
  const untrackedMkd = expectedMkd - closingMkd;
  // Compared as integers (untracked × 10 > income) so no rounding can tip the result.
  return { expectedMkd, untrackedMkd, alert: untrackedMkd * 10 > incomeMkd };
}
