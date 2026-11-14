const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonth(value: string, field: string): void {
  if (!MONTH.test(value)) {
    throw new RangeError(`${field} must look like "2026-11", got "${value}"`);
  }
}

/** The highest yearly rate a loan can have: 100.00 %, in basis points (1 bp = 0.01 %). */
export const MAX_LOAN_RATE_BP = 10_000;

/** How many monthly payments a loan has from its first to its last month, both included. */
export function loanTermMonths(startMonth: string, endMonth: string): number {
  assertMonth(startMonth, 'startMonth');
  assertMonth(endMonth, 'endMonth');
  const months =
    (Number(endMonth.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 +
    (Number(endMonth.slice(5, 7)) - Number(startMonth.slice(5, 7))) +
    1;
  if (months < 1) throw new RangeError('endMonth must not be before startMonth');
  return months;
}

/**
 * The fixed monthly payment of an annuity loan, in whole denars (rounded to the nearest denar):
 * principal × r / (1 − (1 + r)^−n) with r the monthly rate. A rate of 0 splits the principal evenly.
 * `annualRateBp` is the yearly rate in basis points (450 = 4.50 %), so no fractions are stored.
 * Rounding means the last payment of a real loan can differ by a few denars from this one.
 */
export function annuityPaymentMkd(
  principalMkd: number,
  annualRateBp: number,
  termMonths: number,
): number {
  if (!Number.isInteger(principalMkd) || principalMkd < 1) {
    throw new RangeError('principalMkd must be a whole number of at least 1');
  }
  if (!Number.isInteger(annualRateBp) || annualRateBp < 0 || annualRateBp > MAX_LOAN_RATE_BP) {
    throw new RangeError(`annualRateBp must be a whole number from 0 to ${MAX_LOAN_RATE_BP}`);
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError('termMonths must be a whole number of at least 1');
  }
  if (annualRateBp === 0) return Math.round(principalMkd / termMonths);
  const monthlyRate = annualRateBp / 10_000 / 12;
  return Math.round((principalMkd * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));
}

/** The rate and the monthly payment of a loan, as they stand in some month. */
export interface LoanTerms {
  /** Yearly rate in basis points (450 = 4.50 %). */
  annualRateBp: number;
  /** The fixed payment per month, in whole denars. */
  monthlyPaymentMkd: number;
}

/** New terms from a month on: the rate the lender announced and the payment the bank asks for. */
export interface RateChange extends LoanTerms {
  /** The first month the new terms apply, "YYYY-MM". */
  effectiveMonth: string;
}

/**
 * The terms in force in a month: those of the latest rate change that has started by then, or the
 * loan's first terms before any change. The changes need not be sorted.
 */
export function loanTermsInMonth(
  initial: LoanTerms,
  changes: readonly RateChange[],
  month: string,
): LoanTerms {
  assertMonth(month, 'month');
  let current: LoanTerms = initial;
  let currentFrom = '';
  for (const change of changes) {
    assertMonth(change.effectiveMonth, 'effectiveMonth');
    if (change.effectiveMonth <= month && change.effectiveMonth >= currentFrom) {
      current = change;
      currentFrom = change.effectiveMonth;
    }
  }
  return { annualRateBp: current.annualRateBp, monthlyPaymentMkd: current.monthlyPaymentMkd };
}

/** Money paid on top of the regular payment in a month; it goes straight off what is owed. */
export interface LoanExtra {
  /** "YYYY-MM". */
  month: string;
  amountMkd: number;
}

export interface LoanDefinition {
  principalMkd: number;
  /** First payment month, "YYYY-MM". */
  startMonth: string;
  /** Last payment month, "YYYY-MM". */
  endMonth: string;
  /** The terms from the first month. */
  initial: LoanTerms;
  changes: readonly RateChange[];
  /** Extra payments and payoffs. Several in one month add up. */
  extras?: readonly LoanExtra[];
}

export interface LoanScheduleRow {
  /** "YYYY-MM". */
  month: string;
  /** What was still owed at the start of the month. */
  openingMkd: number;
  /** The month's interest, rounded to a whole denar. */
  interestMkd: number;
  /** What is paid that month. */
  paymentMkd: number;
  /** Extra money paid that month, after the regular payment (0 when none). */
  extraMkd: number;
  /** What is still owed after the payment and any extra. */
  closingMkd: number;
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${month.slice(0, 5)}${String(m + 1).padStart(2, '0')}`;
}

function extraIn(extras: readonly LoanExtra[] | undefined, month: string): number {
  let total = 0;
  for (const extra of extras ?? []) {
    assertMonth(extra.month, 'extra month');
    if (!Number.isInteger(extra.amountMkd) || extra.amountMkd < 1) {
      throw new RangeError('extra amountMkd must be a whole number of at least 1');
    }
    if (extra.month === month) total += extra.amountMkd;
  }
  return total;
}

/**
 * Month by month: interest on what is owed, then the payment in force. A payment is never more than
 * what is owed, so the loan ends when it is paid off, and the last month (the loan's end) pays
 * whatever is left, which can differ a little from the regular payment (rounding) or be larger when
 * the typed payments do not cover the interest. An extra payment comes off what is owed after that
 * month's regular payment. Rows stop once nothing is owed, so the last row is the payoff month.
 */
export function loanSchedule(loan: LoanDefinition): LoanScheduleRow[] {
  if (!Number.isInteger(loan.principalMkd) || loan.principalMkd < 1) {
    throw new RangeError('principalMkd must be a whole number of at least 1');
  }
  const months = loanTermMonths(loan.startMonth, loan.endMonth);
  const rows: LoanScheduleRow[] = [];
  let owed = loan.principalMkd;
  let month = loan.startMonth;
  for (let i = 0; i < months && owed > 0; i += 1) {
    const terms = loanTermsInMonth(loan.initial, loan.changes, month);
    const interestMkd = Math.round((owed * terms.annualRateBp) / 120_000);
    const dueMkd = owed + interestMkd;
    const paymentMkd = i === months - 1 ? dueMkd : Math.min(terms.monthlyPaymentMkd, dueMkd);
    const extraMkd = Math.min(extraIn(loan.extras, month), dueMkd - paymentMkd);
    rows.push({
      month,
      openingMkd: owed,
      interestMkd,
      paymentMkd,
      extraMkd,
      closingMkd: dueMkd - paymentMkd - extraMkd,
    });
    owed = dueMkd - paymentMkd - extraMkd;
    month = nextMonth(month);
  }
  return rows;
}

/** What is still owed at the start of a month (the whole principal before the loan starts). */
export function balanceAtStartOfMonth(loan: LoanDefinition, month: string): number {
  assertMonth(month, 'month');
  if (month <= loan.startMonth) return loan.principalMkd;
  const rows = loanSchedule(loan);
  const row = rows.find((r) => r.month === month);
  if (row) return row.openingMkd;
  const last = rows[rows.length - 1];
  return last ? last.closingMkd : loan.principalMkd;
}

/**
 * A suggestion for the new payment of a rate change: the annuity payment that pays off what is
 * still owed at the start of the effective month over the months left, at the new rate. The bank's
 * own figure is what the user types; this is only a guide. `null` when nothing is left to pay.
 */
export function suggestedPaymentMkd(
  loan: LoanDefinition,
  effectiveMonth: string,
  newRateBp: number,
): number | null {
  assertMonth(effectiveMonth, 'effectiveMonth');
  if (effectiveMonth > loan.endMonth) return null;
  const owed = balanceAtStartOfMonth(loan, effectiveMonth);
  if (owed < 1) return null;
  const from = effectiveMonth < loan.startMonth ? loan.startMonth : effectiveMonth;
  return annuityPaymentMkd(owed, newRateBp, loanTermMonths(from, loan.endMonth));
}

/** The month the last money is paid (the loan is gone after it), or `null` when the loan has no rows. */
export function loanPayoffMonth(loan: LoanDefinition): string | null {
  const rows = loanSchedule(loan);
  return rows.length === 0 ? null : rows[rows.length - 1]!.month;
}

/** The month after a "YYYY-MM" month. */
export function monthAfter(month: string): string {
  assertMonth(month, 'month');
  return nextMonth(month);
}
