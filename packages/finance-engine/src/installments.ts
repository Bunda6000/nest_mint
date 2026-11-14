/** The most installments a plan can have (50 years of monthly payments). */
export const MAX_INSTALLMENTS = 600;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonth(value: string, field: string): void {
  if (!MONTH.test(value)) throw new RangeError(`${field} must look like "2026-11", got "${value}"`);
}

function assertAmount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a whole number of at least 1`);
  }
}

/** "2023-10" plus 49 months is "2027-11". */
export function addMonths(month: string, months: number): string {
  assertMonth(month, 'month');
  if (!Number.isInteger(months) || months < 0) throw new RangeError('months must be 0 or more');
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * An installment plan: a contract total paid as one first installment, then regular ones, and a
 * last smaller one for what is left when the total is not a whole number of regular installments
 * (153,750 = 5,500 + 48 × 3,075 + 650). One installment per month.
 */
export interface InstallmentPlan {
  contractTotalMkd: number;
  /** The amount of every installment, in order. They add up to the contract total. */
  amounts: number[];
}

export function installmentPlan(
  contractTotalMkd: number,
  firstInstallmentMkd: number,
  regularInstallmentMkd: number,
): InstallmentPlan {
  assertAmount(contractTotalMkd, 'contractTotalMkd');
  assertAmount(firstInstallmentMkd, 'firstInstallmentMkd');
  assertAmount(regularInstallmentMkd, 'regularInstallmentMkd');
  if (firstInstallmentMkd > contractTotalMkd) {
    throw new RangeError('firstInstallmentMkd must not be more than the contract total');
  }
  const amounts = [firstInstallmentMkd];
  let left = contractTotalMkd - firstInstallmentMkd;
  while (left > 0) {
    if (amounts.length >= MAX_INSTALLMENTS) {
      throw new RangeError(`A plan can have at most ${MAX_INSTALLMENTS} installments`);
    }
    const amount = Math.min(regularInstallmentMkd, left);
    amounts.push(amount);
    left -= amount;
  }
  return { contractTotalMkd, amounts };
}

/** The last month of a plan that starts in `startMonth`. */
export function installmentEndMonth(plan: InstallmentPlan, startMonth: string): string {
  return addMonths(startMonth, plan.amounts.length - 1);
}

/** What the installment of `month` is, or `null` for a month outside the plan. */
export function installmentAmountInMonth(
  plan: InstallmentPlan,
  startMonth: string,
  month: string,
): number | null {
  assertMonth(startMonth, 'startMonth');
  assertMonth(month, 'month');
  const index =
    (Number(month.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 +
    (Number(month.slice(5, 7)) - Number(startMonth.slice(5, 7)));
  return index >= 0 && index < plan.amounts.length ? plan.amounts[index]! : null;
}

export interface InstallmentProgress {
  /** The contract total less what was paid; 0 when fully paid. */
  remainingMkd: number;
  /** Installments not paid yet. */
  installmentsLeft: number;
}

/** From what was really paid: the amount of each paid installment, not what was expected. */
export function installmentProgress(
  plan: InstallmentPlan,
  paidAmountsMkd: readonly number[],
): InstallmentProgress {
  const paid = paidAmountsMkd.reduce((sum, amount) => {
    assertAmount(amount, 'a paid amount');
    return sum + amount;
  }, 0);
  return {
    remainingMkd: Math.max(0, plan.contractTotalMkd - paid),
    installmentsLeft: Math.max(0, plan.amounts.length - paidAmountsMkd.length),
  };
}
