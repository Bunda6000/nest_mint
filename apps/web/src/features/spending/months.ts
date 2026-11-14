import { currentLocale } from '../../i18n/language';

/** Calendar months as "YYYY-MM" strings, e.g. "2026-11". Everything here ignores time zones. */

/** The phone's own current month. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The month `delta` months away (negative = earlier), across year boundaries. */
export function shiftMonth(month: string, delta: number): string {
  const date = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1),
  );
  return date.toISOString().slice(0, 7);
}

/** The last calendar day, "YYYY-MM-DD". Leap years included. */
export function lastDayOfMonth(month: string): string {
  const next = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
  return new Date(next).toISOString().slice(0, 10);
}

/** "2026-11" → "November 2026". */
export function formatMonth(month: string, locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** "2026-11" → "Nov", for the labels under a chart. */
export function shortMonth(month: string, locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}
