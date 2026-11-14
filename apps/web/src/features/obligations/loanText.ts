import { loanTermsInMonth } from '@nestmint/finance-engine';
import type {
  LoanDetails,
  LoanType,
  ObligationResponse,
  RateChangeResponse,
} from '@nestmint/shared';
import { formatMkd } from '../../format';

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  housing: 'Home loan',
  consumer: 'Consumer loan',
  other: 'Other loan',
};

export type ParsedRate =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'ok'; basisPoints: number };

/**
 * Reads a yearly rate typed in percent ("4.5", "4,5", "6") as basis points (450, 450, 600).
 * Either a dot or a comma may be the decimal mark, since a rate has no thousands. More than two
 * decimals is refused rather than rounded, so what is saved is what was typed.
 */
export function parseRatePercent(text: string): ParsedRate {
  const cleaned = text.trim().replace(/\s/g, '').replace('%', '').replace(',', '.');
  if (cleaned === '') return { status: 'empty' };
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) {
    return /^\d+\.\d{3,}$/.test(cleaned)
      ? { status: 'invalid', message: 'Use at most two decimals, for example 4.5' }
      : { status: 'invalid', message: 'Enter a rate in percent, for example 4.5' };
  }
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (basisPoints > 10_000) return { status: 'invalid', message: 'Rate must be at most 100' };
  return { status: 'ok', basisPoints };
}

/** 450 → "4.5 %", 600 → "6 %", 0 → "0 %", 375 → "3.75 %". */
export function formatRateBp(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))} %`;
}

/** The line under a loan's name: its type, what was borrowed and at what rate. */
export function describeLoan(loan: LoanDetails): string {
  return `${LOAN_TYPE_LABELS[loan.loanType]} · ${formatMkd(loan.principalMkd)} borrowed · ${formatRateBp(loan.annualRateBp)} a year`;
}

/** The loan's rate and payment in force in a month: the latest rate change that has started. */
export function currentLoanTerms(
  obligation: Pick<ObligationResponse, 'expectedAmountMkd' | 'loan'>,
  month: string,
): { annualRateBp: number; monthlyPaymentMkd: number } {
  const loan = obligation.loan;
  const initial = {
    annualRateBp: loan?.annualRateBp ?? 0,
    monthlyPaymentMkd: obligation.expectedAmountMkd,
  };
  return loanTermsInMonth(initial, loan?.rateChanges ?? [], month);
}

/** "From 2026-10: 7 %, 16,000 MKD a month". */
export function describeRateChange(change: RateChangeResponse): string {
  return `From ${change.effectiveMonth}: ${formatRateBp(change.annualRateBp)}, ${formatMkd(change.monthlyPaymentMkd)} a month`;
}
