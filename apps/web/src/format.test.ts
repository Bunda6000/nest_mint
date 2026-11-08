import { describe, expect, it } from 'vitest';
import { formatDay, formatEurCents, formatMkd, formatRate, localDay } from './format';

describe('format', () => {
  it('formats denars', () => {
    expect(formatMkd(127088)).toBe('127,088 MKD');
  });

  it('formats savings rate and the empty case', () => {
    expect(formatRate(0.4377)).toBe('43.8%');
    expect(formatRate(null)).toBe('—');
  });
});

describe('formatEurCents', () => {
  it('shows euros and cents', () => {
    expect(formatEurCents(732)).toBe('€7.32');
    expect(formatEurCents(18_943)).toBe('€189.43');
    expect(formatEurCents(0)).toBe('€0.00');
    expect(formatEurCents(341_301)).toBe('€3,413.01');
  });

  it('shows a loss with a minus sign', () => {
    expect(formatEurCents(-4_065)).toBe('-€40.65');
  });
});

describe('formatDay', () => {
  it('formats the calendar day without shifting it', () => {
    expect(formatDay('2026-11-08')).toBe('Nov 8, 2026');
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDay('2024-02-29')).toBe('Feb 29, 2024');
  });
});

describe('localDay', () => {
  it('uses the local calendar day, with leading zeros', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 10, 8, 0, 1))).toBe('2026-11-08');
    expect(localDay(new Date(2026, 11, 31, 12, 0))).toBe('2026-12-31');
  });
});
