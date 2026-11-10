export type BillStatus = 'due' | 'overdue' | 'paid';

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "2026-11-15" → days since 1970, so two days can be subtracted. Refuses days that do not exist. */
function dayNumber(value: string, field: string): number {
  const valid = DAY.test(value);
  const time = valid
    ? Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10))
    : NaN;
  // Date rolls 31 February over to March, so the day must come back unchanged.
  if (!valid || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${field} must be a real day like "2026-11-15", got "${value}"`);
  }
  return time / 86_400_000;
}

/**
 * Where a bill stands on a day: paid once it has a payment; otherwise overdue when its due date is
 * before that day, and due when it is that day or later (a bill due today is not late yet).
 */
export function billStatus(bill: { paid: boolean; dueDate: string }, asOf: string): BillStatus {
  dayNumber(asOf, 'asOf');
  const due = dayNumber(bill.dueDate, 'dueDate');
  if (bill.paid) return 'paid';
  return due < dayNumber(asOf, 'asOf') ? 'overdue' : 'due';
}

/** How many days late an unpaid bill is on a day: 0 when it is due that day or later. */
export function daysOverdue(dueDate: string, asOf: string): number {
  return Math.max(0, dayNumber(asOf, 'asOf') - dayNumber(dueDate, 'dueDate'));
}

/**
 * What a bill costs: what was really paid if it is paid, else the actual amount once it is known
 * (from the invoice), else the expected amount.
 */
export function billAmount(bill: {
  paidAmount: number | null;
  actualAmount: number | null;
  expectedAmount: number;
}): number {
  return bill.paidAmount ?? bill.actualAmount ?? bill.expectedAmount;
}
