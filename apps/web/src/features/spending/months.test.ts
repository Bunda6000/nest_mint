import { describe, expect, it } from 'vitest';
import { currentMonth, formatMonth, lastDayOfMonth, shiftMonth, shortMonth } from './months';

describe('currentMonth', () => {
  it('uses the local month with a leading zero', () => {
    expect(currentMonth(new Date(2026, 10, 8))).toBe('2026-11');
    expect(currentMonth(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    expect(currentMonth(new Date(2025, 11, 1, 0, 1))).toBe('2025-12');
  });
});

describe('shiftMonth', () => {
  it('moves by one month, across year boundaries', () => {
    expect(shiftMonth('2026-11', -1)).toBe('2026-10');
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });

  it('moves by many months, and by none', () => {
    expect(shiftMonth('2026-11', -11)).toBe('2025-12');
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });
});

describe('lastDayOfMonth', () => {
  it.each([
    ['2026-01', '2026-01-31'],
    ['2026-02', '2026-02-28'],
    ['2024-02', '2024-02-29'],
    ['2100-02', '2100-02-28'],
    ['2000-02', '2000-02-29'],
    ['2026-04', '2026-04-30'],
    ['2026-12', '2026-12-31'],
  ])('%s ends on %s', (month, day) => {
    expect(lastDayOfMonth(month)).toBe(day);
  });
});

describe('formatMonth', () => {
  it('writes the month name and year', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
    expect(formatMonth('2026-01')).toBe('January 2026');
    expect(formatMonth('2025-12')).toBe('December 2025');
  });
});

describe('shortMonth', () => {
  it.each([
    ['2026-01', 'Jan'],
    ['2026-11', 'Nov'],
    ['2026-12', 'Dec'],
  ])('%s is %s', (month, expected) => {
    expect(shortMonth(month)).toBe(expected);
  });
});
