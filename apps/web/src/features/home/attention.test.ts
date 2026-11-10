import type { BillResponse } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { addDays, DUE_SOON_DAYS, needsAttention } from './attention';

const bill = (id: string, dueDate: string): BillResponse =>
  ({ id, dueDate, obligationName: id }) as BillResponse;

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-11-08', 7)).toBe('2026-11-15');
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('knows leap years', () => {
    expect(addDays('2028-02-25', 7)).toBe('2028-03-03');
    expect(addDays('2027-02-25', 7)).toBe('2027-03-04');
  });
});

describe('needsAttention', () => {
  const today = '2026-11-08';

  it('looks a week ahead', () => {
    expect(DUE_SOON_DAYS).toBe(7);
  });

  it('takes every overdue bill first, then due bills within a week, today and the last day included', () => {
    const result = needsAttention(
      [bill('late-1', '2026-10-01'), bill('late-2', '2026-11-07')],
      [
        bill('today', '2026-11-08'),
        bill('limit', '2026-11-15'),
        bill('too-far', '2026-11-16'),
        bill('much-later', '2026-12-31'),
      ],
      today,
    );
    expect(result.map((b) => b.id)).toEqual(['late-1', 'late-2', 'today', 'limit']);
  });

  it('is empty when nothing is overdue or close', () => {
    expect(needsAttention([], [bill('later', '2026-12-01')], today)).toEqual([]);
    expect(needsAttention([], [], today)).toEqual([]);
  });
});
