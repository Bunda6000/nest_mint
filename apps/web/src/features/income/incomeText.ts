import type { IncomeResponse } from '@nestmint/shared';
import { formatDay } from '../../format';
import { formatMonth } from '../spending/months';

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The line under an income's name: when it arrives and for how long. */
export function describeIncome(income: IncomeResponse): string {
  if (income.recurrence === 'one_off') {
    return `One-off · ${formatDay(income.receivedOn ?? '')}`;
  }
  const from = `from ${formatMonth(income.startMonth ?? '')}`;
  const until = income.endMonth ? `until ${formatMonth(income.endMonth)}` : 'ongoing';
  return `Every month on the ${ordinal(income.payDay ?? 0)} · ${from} · ${until}`;
}
