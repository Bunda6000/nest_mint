/** One bill of an obligation: the month it belongs to and its amount (the real one once known). */
export interface BillAmount {
  /** The billing period, "YYYY-MM". */
  periodMonth: string;
  /** Whole denars. */
  amountMkd: number;
}

export interface ObligationTotals {
  /** One entry per year that has bills, oldest first. */
  byYear: { year: number; totalMkd: number }[];
  /** All bills of the obligation, whatever the year. */
  lifetimeMkd: number;
}

/**
 * Accrual view of one obligation (NM-6): totals by billing period, whether or not the bills are
 * paid. A bill counts in the year of its period, not the day it was paid.
 */
export function obligationTotals(bills: readonly BillAmount[]): ObligationTotals {
  const perYear = new Map<number, number>();
  let lifetimeMkd = 0;
  for (const bill of bills) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bill.periodMonth)) {
      throw new RangeError(`periodMonth must look like "2026-11", got "${bill.periodMonth}"`);
    }
    if (!Number.isInteger(bill.amountMkd) || bill.amountMkd < 0) {
      throw new RangeError('amountMkd must be a whole number of denars, 0 or more');
    }
    const year = Number(bill.periodMonth.slice(0, 4));
    perYear.set(year, (perYear.get(year) ?? 0) + bill.amountMkd);
    lifetimeMkd += bill.amountMkd;
  }
  return {
    byYear: [...perYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, totalMkd]) => ({ year, totalMkd })),
    lifetimeMkd,
  };
}
