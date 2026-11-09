import { describe, expect, it } from 'vitest';
import { type BillSchedule, dueDateInMonth, isDueInMonth } from './obligations.js';

const schedule = (over: Partial<BillSchedule> = {}): BillSchedule => ({
  recurrence: 'monthly',
  dueDay: 15,
  everyNMonths: null,
  months: null,
  startMonth: '2026-01',
  endMonth: null,
  ...over,
});

describe('isDueInMonth: monthly', () => {
  it('is due in every month from the start month', () => {
    const s = schedule();
    expect(isDueInMonth(s, '2026-01')).toBe(true);
    expect(isDueInMonth(s, '2026-07')).toBe(true);
    expect(isDueInMonth(s, '2031-12')).toBe(true);
  });

  it('is not due before the start month, also across a year boundary', () => {
    const s = schedule({ startMonth: '2026-03' });
    expect(isDueInMonth(s, '2026-02')).toBe(false);
    expect(isDueInMonth(s, '2025-12')).toBe(false);
    expect(isDueInMonth(s, '2026-03')).toBe(true);
  });

  it('stops after the end month, which is still included', () => {
    const s = schedule({ startMonth: '2026-01', endMonth: '2026-06' });
    expect(isDueInMonth(s, '2026-06')).toBe(true);
    expect(isDueInMonth(s, '2026-07')).toBe(false);
    expect(isDueInMonth(s, '2027-01')).toBe(false);
  });

  it('can start and end in the same month', () => {
    const s = schedule({ startMonth: '2026-05', endMonth: '2026-05' });
    expect([4, 5, 6].map((m) => isDueInMonth(s, `2026-0${m}`))).toEqual([false, true, false]);
  });
});

describe('isDueInMonth: every n months', () => {
  it('counts from the start month: every 3 from January is Jan, Apr, Jul, Oct', () => {
    const s = schedule({ recurrence: 'every_n_months', everyNMonths: 3 });
    const due = Array.from(
      { length: 12 },
      (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
    ).filter((m) => isDueInMonth(s, m));
    expect(due).toEqual(['2026-01', '2026-04', '2026-07', '2026-10']);
    expect(isDueInMonth(s, '2027-01')).toBe(true);
  });

  it('counts from a start month that is not January, across the year boundary', () => {
    const s = schedule({ recurrence: 'every_n_months', everyNMonths: 2, startMonth: '2026-11' });
    expect(
      ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((m) => isDueInMonth(s, m)),
    ).toEqual([true, false, true, false, true]);
  });

  it('is yearly with 12', () => {
    const s = schedule({ recurrence: 'every_n_months', everyNMonths: 12, startMonth: '2026-04' });
    expect(isDueInMonth(s, '2026-04')).toBe(true);
    expect(isDueInMonth(s, '2027-04')).toBe(true);
    expect(isDueInMonth(s, '2027-03')).toBe(false);
  });

  it('is not due before the start or after the end', () => {
    const s = schedule({
      recurrence: 'every_n_months',
      everyNMonths: 2,
      startMonth: '2026-03',
      endMonth: '2026-07',
    });
    expect(
      ['2026-01', '2026-03', '2026-05', '2026-07', '2026-09'].map((m) => isDueInMonth(s, m)),
    ).toEqual([false, true, true, true, false]);
  });
});

describe('isDueInMonth: custom months', () => {
  const heating = schedule({
    recurrence: 'custom_months',
    months: [11, 12, 1, 2, 3],
    startMonth: '2025-01',
  });

  it('is due only in the listed calendar months, every year', () => {
    const due = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) =>
      isDueInMonth(heating, `2026-${String(m).padStart(2, '0')}`),
    );
    expect(due).toEqual([1, 2, 3, 11, 12]);
    expect(isDueInMonth(heating, '2027-12')).toBe(true);
  });

  it('is not due before the start month even when the calendar month is listed', () => {
    const s = schedule({ recurrence: 'custom_months', months: [1, 2], startMonth: '2026-02' });
    expect(isDueInMonth(s, '2026-01')).toBe(false);
    expect(isDueInMonth(s, '2026-02')).toBe(true);
    expect(isDueInMonth(s, '2027-01')).toBe(true);
  });

  it('stops after the end month', () => {
    const s = schedule({
      recurrence: 'custom_months',
      months: [12],
      startMonth: '2025-01',
      endMonth: '2026-06',
    });
    expect(isDueInMonth(s, '2025-12')).toBe(true);
    expect(isDueInMonth(s, '2026-12')).toBe(false);
  });

  it('copes with a month listed twice', () => {
    const s = schedule({ recurrence: 'custom_months', months: [5, 5] });
    expect(isDueInMonth(s, '2026-05')).toBe(true);
  });
});

describe('isDueInMonth: refuses nonsense', () => {
  it('a month that is not a month', () => {
    expect(() => isDueInMonth(schedule(), '2026-13')).toThrow(RangeError);
    expect(() => isDueInMonth(schedule(), 'nov')).toThrow(RangeError);
  });

  it('a bad due day', () => {
    for (const dueDay of [0, 32, 1.5, -1]) {
      expect(() => isDueInMonth(schedule({ dueDay }), '2026-01')).toThrow(RangeError);
    }
  });

  it('a bad start or end month, or an end before the start', () => {
    expect(() => isDueInMonth(schedule({ startMonth: '2026-1' }), '2026-01')).toThrow(RangeError);
    expect(() => isDueInMonth(schedule({ endMonth: '2026-13' }), '2026-01')).toThrow(RangeError);
    expect(() =>
      isDueInMonth(schedule({ startMonth: '2026-05', endMonth: '2026-04' }), '2026-05'),
    ).toThrow(RangeError);
  });

  it('every n months without a valid n', () => {
    for (const everyNMonths of [null, 1, 13, 2.5]) {
      expect(() =>
        isDueInMonth(schedule({ recurrence: 'every_n_months', everyNMonths }), '2026-01'),
      ).toThrow(RangeError);
    }
  });

  it('custom months without a valid list', () => {
    for (const months of [null, [], [0], [13], [1.5]]) {
      expect(() =>
        isDueInMonth(schedule({ recurrence: 'custom_months', months }), '2026-01'),
      ).toThrow(RangeError);
    }
  });

  it('an unknown recurrence', () => {
    expect(() =>
      isDueInMonth(schedule({ recurrence: 'weekly' as unknown as 'monthly' }), '2026-01'),
    ).toThrow(RangeError);
  });
});

describe('dueDateInMonth', () => {
  it.each([
    ['2026-11', 15, '2026-11-15'],
    ['2026-11', 1, '2026-11-01'],
    ['2026-01', 31, '2026-01-31'],
    ['2026-11', 31, '2026-11-30'],
    ['2026-02', 29, '2026-02-28'],
    ['2024-02', 29, '2024-02-29'],
    ['2024-02', 31, '2024-02-29'],
    ['2026-04', 30, '2026-04-30'],
    ['2026-12', 31, '2026-12-31'],
  ])('%s with due day %d is %s', (month, dueDay, expected) => {
    expect(dueDateInMonth(month, dueDay)).toBe(expected);
  });

  it('refuses a bad month or day', () => {
    expect(() => dueDateInMonth('2026-13', 5)).toThrow(RangeError);
    expect(() => dueDateInMonth('2026-11', 0)).toThrow(RangeError);
    expect(() => dueDateInMonth('2026-11', 32)).toThrow(RangeError);
    expect(() => dueDateInMonth('2026-11', 1.5)).toThrow(RangeError);
  });
});
