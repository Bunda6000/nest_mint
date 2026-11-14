import {
  installmentAmountInMonth,
  installmentPlan,
  type LoanDefinition,
  loanTermsInMonth,
} from '@nestmint/finance-engine';
import type { ObligationResponse } from '@nestmint/shared';

/**
 * What an obligation expects to cost in a month. A bill: always its usual amount. An installment
 * plan: that month's installment (the first, the regular ones, the smaller last one). A loan: the
 * monthly payment of the terms in force that month, so a rate change reaches only the months from
 * its effective month on.
 */
export function expectedAmountInMonth(
  obligation: Pick<ObligationResponse, 'expectedAmountMkd' | 'loan' | 'installment' | 'startMonth'>,
  month: string,
): number {
  if (obligation.installment) {
    const plan = installmentPlan(
      obligation.installment.contractTotalMkd,
      obligation.installment.firstInstallmentMkd,
      obligation.expectedAmountMkd,
    );
    return (
      installmentAmountInMonth(plan, obligation.startMonth, month) ?? obligation.expectedAmountMkd
    );
  }
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

/** The loan as the finance engine wants it. `null` for a plain bill or a loan without a last month. */
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
