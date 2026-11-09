/** A share of a total as a whole percent; "<1%" instead of a misleading "0%" for a small one. */
export function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

/** "2026-11-02" → "Nov 2". */
export function formatDay(day: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}
