import {
  balanceAtStartOfMonth,
  type LoanDefinition,
  loanTermsInMonth,
  monthAfter,
} from '@nestmint/finance-engine';
import type {
  ExtraPaymentEffect,
  ExtraPaymentResponse,
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

/** The loan as the finance engine wants it; `null` for a bill. */
export function loanDefinitionOf(
  obligation: Pick<ObligationResponse, 'expectedAmountMkd' | 'loan' | 'startMonth' | 'endMonth'>,
): LoanDefinition | null {
  const { loan, endMonth } = obligation;
  if (!loan || !endMonth) return null;
  return {
    principalMkd: loan.principalMkd,
    startMonth: obligation.startMonth,
    endMonth,
    initial: { annualRateBp: loan.annualRateBp, monthlyPaymentMkd: obligation.expectedAmountMkd },
    changes: loan.rateChanges,
    extras: loan.extraPayments.map((e) => ({
      month: e.paidOn.slice(0, 7),
      amountMkd: e.amountMkd,
    })),
  };
}

/** The day the loan was paid off, or `null`. */
export function payoffDay(loan: LoanDetails): string | null {
  return loan.extraPayments.find((e) => e.kind === 'payoff')?.paidOn ?? null;
}

/**
 * An estimate of what is still owed after this month's payment, worked out from the loan's own
 * figures. The bank's statement is the real number. `null` when the loan is paid off or over.
 */
export function estimateStillOwed(
  obligation: Pick<ObligationResponse, 'expectedAmountMkd' | 'loan' | 'startMonth' | 'endMonth'>,
  thisMonth: string,
): number | null {
  const definition = loanDefinitionOf(obligation);
  if (!definition || !obligation.loan || payoffDay(obligation.loan)) return null;
  const owed = balanceAtStartOfMonth(definition, monthAfter(thisMonth));
  return owed > 0 ? owed : null;
}

/** "Extra 20,000 MKD on 2026-05-10" / "Paid off on 2026-11-05 with 20,000 MKD". */
export function describeExtraPayment(payment: ExtraPaymentResponse): string {
  return payment.kind === 'payoff'
    ? `Paid off on ${payment.paidOn} with ${formatMkd(payment.amountMkd)}`
    : `Extra ${formatMkd(payment.amountMkd)} on ${payment.paidOn}`;
}

export const EXTRA_EFFECT_LABELS: Record<ExtraPaymentEffect, string> = {
  shorten: 'Keep the payment, end the loan earlier',
  lower_payment: 'Lower the payment, keep the end date',
  none: 'No change to the bills',
};
