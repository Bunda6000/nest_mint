import { currentLocale } from './i18n/language';

/** Formats whole denars, e.g. 127088 → "127,088 MKD". */
export function formatMkd(amount: number, locale = currentLocale()): string {
  return `${new Intl.NumberFormat(locale).format(amount)} MKD`;
}

/** Formats a savings rate fraction, e.g. 0.4377 → "43.8%"; null → "—". */
export function formatRate(rate: number | null, locale = currentLocale()): string {
  if (rate === null) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate);
}

/** Formats euro cents, e.g. 732 → "€7.32". */
export function formatEurCents(cents: number, locale = currentLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Formats a calendar day, e.g. "2026-11-08" → "Nov 8, 2026". The day never shifts with the time zone. */
export function formatDay(day: string, locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** The phone's own calendar day as "YYYY-MM-DD" (not UTC, which can still be yesterday). */
export function localDay(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
