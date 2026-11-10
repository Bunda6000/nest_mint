import type { BillResponse } from '@nestmint/shared';

/** How far ahead a bill counts as "due soon". */
export const DUE_SOON_DAYS = 7;

/** The calendar day `days` after `day` ("YYYY-MM-DD"); time zones never shift it. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The bills that need attention today: every overdue bill, then the due ones that fall within the
 * next DUE_SOON_DAYS days (today included). Each list is already soonest-due first.
 */
export function needsAttention(
  overdue: readonly BillResponse[],
  due: readonly BillResponse[],
  today: string,
): BillResponse[] {
  const limit = addDays(today, DUE_SOON_DAYS);
  return [...overdue, ...due.filter((bill) => bill.dueDate <= limit)];
}
