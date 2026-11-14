import { installmentEndMonth, installmentPlan, MAX_INSTALLMENTS } from '@nestmint/finance-engine';
import type { InstallmentDetails } from '@nestmint/shared';
import { formatMkd } from '../../format';
import { formatMonth } from '../spending/months';

/** "Contract 153,750 MKD · 50 installments, first 5,500 MKD". */
export function describeInstallmentPlan(plan: InstallmentDetails): string {
  return `Contract ${formatMkd(plan.contractTotalMkd)} · ${plan.installmentCount} installments, first ${formatMkd(plan.firstInstallmentMkd)}`;
}

/** "Paid 28 of 50 · 65,225 MKD left · 22 installments left", or "Fully paid". */
export function describeInstallmentProgress(plan: InstallmentDetails): string {
  if (plan.installmentsLeft === 0 && plan.remainingMkd === 0) return 'Fully paid';
  const left =
    plan.installmentsLeft === 1 ? '1 installment' : `${plan.installmentsLeft} installments`;
  return `Paid ${plan.paidCount} of ${plan.installmentCount} · ${formatMkd(plan.remainingMkd)} left · ${left} left`;
}

/**
 * What the plan would look like, for the form to show while it is typed: how many installments,
 * the smaller last one and the last month. `null` while the numbers do not make a plan yet.
 */
export function previewInstallmentPlan(
  contractTotalMkd: number,
  firstInstallmentMkd: number,
  regularInstallmentMkd: number,
  startMonth: string,
): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) return null;
  if (firstInstallmentMkd > contractTotalMkd) return null;
  try {
    const plan = installmentPlan(contractTotalMkd, firstInstallmentMkd, regularInstallmentMkd);
    const count = plan.amounts.length;
    const last = plan.amounts[count - 1]!;
    const lastText =
      count > 1 && last !== regularInstallmentMkd ? `, the last one ${formatMkd(last)}` : '';
    return `${count} installments${lastText}, until ${formatMonth(installmentEndMonth(plan, startMonth))}`;
  } catch (error) {
    if (error instanceof RangeError) return `Too many installments (at most ${MAX_INSTALLMENTS})`;
    throw error;
  }
}
