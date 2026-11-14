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
