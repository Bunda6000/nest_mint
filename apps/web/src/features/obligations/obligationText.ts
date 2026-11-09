import type { BillResponse, ObligationResponse } from '@nestmint/shared';
import { ordinal } from '../income/incomeText';
import { formatMonth } from '../spending/months';

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** How often a bill comes: "Every month", "Every 3 months", or the chosen months in calendar order. */
export function describeWhen(obligation: ObligationResponse): string {
  if (obligation.recurrence === 'monthly') return 'Every month';
  if (obligation.recurrence === 'every_n_months') return `Every ${obligation.everyNMonths} months`;
  const months = [...(obligation.months ?? [])].sort((a, b) => a - b);
  return months.map((m) => MONTH_NAMES[m - 1]).join(', ');
}

/** The line under an obligation's name: when it is due and for how long. */
export function describeObligation(obligation: ObligationResponse): string {
  const until = obligation.endMonth ? `until ${formatMonth(obligation.endMonth)}` : 'ongoing';
  return `${describeWhen(obligation)} · due on the ${ordinal(obligation.dueDay)} · from ${formatMonth(obligation.startMonth)} · ${until}`;
}

/** "Nov 15" for a bill's due date ("2026-11-15"). */
export function formatDueDate(bill: Pick<BillResponse, 'dueDate'>): string {
  const month = Number(bill.dueDate.slice(5, 7));
  return `${MONTH_NAMES[month - 1]} ${Number(bill.dueDate.slice(8, 10))}`;
}
