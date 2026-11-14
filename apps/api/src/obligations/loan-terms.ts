import { loanTermsInMonth } from '@nestmint/finance-engine';
import type { ObligationResponse } from '@nestmint/shared';

/**
 * What an obligation expects to cost in a month. A bill: always its usual amount. A loan: the
 * monthly payment of the terms in force that month, so a rate change reaches only the months from
 * its effective month on.
 */
export function expectedAmountInMonth(
  obligation: Pick<ObligationResponse, 'expectedAmountMkd' | 'loan'>,
  month: string,
): number {
  if (!obligation.loan) return obligation.expectedAmountMkd;
  return loanTermsInMonth(
    {
      annualRateBp: obligation.loan.annualRateBp,
      monthlyPaymentMkd: obligation.expectedAmountMkd,
    },
    obligation.loan.rateChanges,
    month,
  ).monthlyPaymentMkd;
}
