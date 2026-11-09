const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonth(value: string, field: string): void {
  if (!MONTH.test(value)) {
    throw new RangeError(`${field} must look like "2026-11", got "${value}"`);
  }
}

/**
 * When a recurring bill (an obligation) is due. `monthly` is due every month from `startMonth`;
 * `every_n_months` every `everyNMonths` months counted from `startMonth` (so 3 from January means
 * January, April, July, October); `custom_months` only in the listed calendar months (1 = January),
 * such as the heating season. In all cases `endMonth`, when set, is the last month it is due.
 */
export interface BillSchedule {
  recurrence: 'monthly' | 'every_n_months' | 'custom_months';
  /** Day of the month, 1 to 31; a short month uses its last day. */
  dueDay: number;
  /** Every n months, 2 to 12. Only for `every_n_months`. */
  everyNMonths: number | null;
  /** Calendar months it is due in, 1 to 12. Only for `custom_months`. */
  months: readonly number[] | null;
  /** First month it can be due, "YYYY-MM". */
  startMonth: string;
  /** Last month it can be due, "YYYY-MM"; null while it goes on. */
  endMonth: string | null;
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
function monthsBetween(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    (Number(to.slice(5, 7)) - Number(from.slice(5, 7)))
  );
}

function assertSchedule(schedule: BillSchedule): void {
  if (!Number.isInteger(schedule.dueDay) || schedule.dueDay < 1 || schedule.dueDay > 31) {
    throw new RangeError('dueDay must be a whole number from 1 to 31');
  }
  assertMonth(schedule.startMonth, 'startMonth');
  if (schedule.endMonth !== null) {
    assertMonth(schedule.endMonth, 'endMonth');
    if (schedule.endMonth < schedule.startMonth) {
      throw new RangeError('endMonth must not be before startMonth');
    }
  }
  switch (schedule.recurrence) {
    case 'monthly':
      return;
    case 'every_n_months':
      if (
        schedule.everyNMonths === null ||
        !Number.isInteger(schedule.everyNMonths) ||
        schedule.everyNMonths < 2 ||
        schedule.everyNMonths > 12
      ) {
        throw new RangeError('everyNMonths must be a whole number from 2 to 12');
      }
      return;
    case 'custom_months':
      if (
        schedule.months === null ||
        schedule.months.length === 0 ||
        schedule.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)
      ) {
        throw new RangeError('months must list at least one month, each from 1 to 12');
      }
      return;
    default:
      throw new RangeError(`unknown recurrence "${String(schedule.recurrence)}"`);
  }
}

/** Is a bill due in this calendar month ("YYYY-MM")? */
export function isDueInMonth(schedule: BillSchedule, month: string): boolean {
  assertMonth(month, 'month');
  assertSchedule(schedule);
  if (month < schedule.startMonth) return false;
  if (schedule.endMonth !== null && month > schedule.endMonth) return false;
  switch (schedule.recurrence) {
    case 'monthly':
      return true;
    case 'every_n_months':
      return monthsBetween(schedule.startMonth, month) % schedule.everyNMonths! === 0;
    case 'custom_months':
      return schedule.months!.includes(Number(month.slice(5, 7)));
  }
}

/** The date a bill is due in a month: the due day, or the month's last day if it is shorter. */
export function dueDateInMonth(month: string, dueDay: number): string {
  assertMonth(month, 'month');
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError('dueDay must be a whole number from 1 to 31');
  }
  const lastDay = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  return `${month}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}
