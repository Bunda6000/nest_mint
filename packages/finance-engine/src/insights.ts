import { assertMoney, type Money } from './money.js';
import { type IncomeSource, monthlyTotals, type MonthTotals } from './monthly-totals.js';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month `delta` months away (negative = earlier), across year boundaries. "YYYY-MM". */
export function shiftMonth(month: string, delta: number): string {
  if (!MONTH.test(month)) throw new RangeError(`month must look like "2026-11", got "${month}"`);
  const date = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1),
  );
  return date.toISOString().slice(0, 7).padStart(7, '0');
}

/** `count` consecutive months ending at `endMonth` (included), oldest first. */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1)
    throw new RangeError('count must be a whole number of 1 or more');
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
}

export interface HistoryMonth extends MonthTotals {
  /**
   * Net of this month plus every earlier month shown: the running total of the window, starting
   * from 0 at its first month (not the all-time balance).
   */
  cumulativeNet: Money;
}

/**
 * Month by month totals for the `count` months ending at `endMonth`, with a running total of net.
 * `expensesByMonth` maps "YYYY-MM" to what was spent; a month that is missing spent nothing.
 */
export function monthlyHistory(
  endMonth: string,
  count: number,
  sources: readonly IncomeSource[],
  expensesByMonth: Readonly<Record<string, Money>>,
): HistoryMonth[] {
  let running = 0;
  return monthsEndingAt(endMonth, count).map((month) => {
    const totals = monthlyTotals(month, sources, expensesByMonth[month] ?? 0);
    running += totals.net;
    return { ...totals, cumulativeNet: running };
  });
}

export interface AmountItem {
  /** Unique id of the thing, such as a category group. Items with the same key are added together. */
  key: string;
  label: string;
  /** Whole denars. Items of 0 are left out. */
  amount: Money;
}

export interface Slice extends AmountItem {
  /** This slice's part of the total, as a fraction (0.25 = 25%). */
  share: number;
}

export const OTHER_KEY = 'other';

/**
 * The slices of a donut: biggest first, never more than `maxSlices`. When there are more items,
 * the smallest ones are merged into one "Other" slice, which always comes last.
 */
export function donutSlices(items: readonly AmountItem[], maxSlices: number): Slice[] {
  if (!Number.isInteger(maxSlices) || maxSlices < 2) {
    throw new RangeError('maxSlices must be a whole number of 2 or more');
  }
  const byKey = new Map<string, AmountItem>();
  for (const item of items) {
    assertMoney(item.amount, `amount of ${item.label}`);
    if (item.amount < 0) throw new RangeError(`amount of ${item.label} must not be negative`);
    const known = byKey.get(item.key);
    byKey.set(item.key, known ? { ...known, amount: known.amount + item.amount } : { ...item });
  }
  const sorted = [...byKey.values()]
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const total = sorted.reduce((sum, item) => sum + item.amount, 0);

  let shown = sorted;
  if (sorted.length > maxSlices) {
    const rest = sorted.slice(maxSlices - 1);
    shown = [
      ...sorted.slice(0, maxSlices - 1),
      { key: OTHER_KEY, label: 'Other', amount: rest.reduce((sum, item) => sum + item.amount, 0) },
    ];
  }
  return shown.map((item) => ({ ...item, share: item.amount / total }));
}
