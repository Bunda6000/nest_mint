import { installmentPlan, installmentProgress } from '@nestmint/finance-engine';
import type { InstallmentDetails } from '@nestmint/shared';

/**
 * The installment plan of an obligation with what was really paid so far (the amount of each paid
 * bill's expense, not what was expected). Shared by the database repository and the test fake so
 * both show the same numbers.
 */
export function installmentDetailsOf(
  contractTotalMkd: number,
  firstInstallmentMkd: number,
  regularInstallmentMkd: number,
  paidAmountsMkd: readonly number[],
): InstallmentDetails {
  const plan = installmentPlan(contractTotalMkd, firstInstallmentMkd, regularInstallmentMkd);
  const progress = installmentProgress(plan, paidAmountsMkd);
  return {
    contractTotalMkd,
    firstInstallmentMkd,
    installmentCount: plan.amounts.length,
    paidCount: paidAmountsMkd.length,
    paidMkd: paidAmountsMkd.reduce((sum, amount) => sum + amount, 0),
    remainingMkd: progress.remainingMkd,
    installmentsLeft: progress.installmentsLeft,
  };
}
