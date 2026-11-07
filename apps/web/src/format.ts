/** Formats whole denars, e.g. 127088 → "127,088 MKD". */
export function formatMkd(amount: number, locale = 'en-US'): string {
  return `${new Intl.NumberFormat(locale).format(amount)} MKD`;
}

/** Formats a savings rate fraction, e.g. 0.4377 → "43.8%"; null → "—". */
export function formatRate(rate: number | null, locale = 'en-US'): string {
  if (rate === null) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate);
}
