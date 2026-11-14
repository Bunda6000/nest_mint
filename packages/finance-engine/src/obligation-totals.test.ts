import { describe, expect, it } from 'vitest';
import { obligationTotals } from './obligation-totals.js';

describe('obligationTotals', () => {
  it('is empty and zero without bills', () => {
    expect(obligationTotals([])).toEqual({ byYear: [], lifetimeMkd: 0 });
  });

  it('adds bills up per year of the billing period, oldest year first', () => {
    const totals = obligationTotals([
      { periodMonth: '2027-01', amountMkd: 3_075 },
      { periodMonth: '2026-12', amountMkd: 3_075 },
      { periodMonth: '2026-11', amountMkd: 3_075 },
    ]);
    expect(totals.byYear).toEqual([
      { year: 2026, totalMkd: 6_150 },
      { year: 2027, totalMkd: 3_075 },
    ]);
    expect(totals.lifetimeMkd).toBe(9_225);
  });

  it('counts an unpaid bill the same as a paid one (the amount is all it needs)', () => {
    expect(obligationTotals([{ periodMonth: '2026-03', amountMkd: 4_500 }]).lifetimeMkd).toBe(
      4_500,
    );
  });

  it('refuses a bad month or a fractional or negative amount', () => {
    expect(() => obligationTotals([{ periodMonth: '2026-3', amountMkd: 1 }])).toThrow(RangeError);
    expect(() => obligationTotals([{ periodMonth: '2026-03', amountMkd: 1.5 }])).toThrow(
      RangeError,
    );
    expect(() => obligationTotals([{ periodMonth: '2026-03', amountMkd: -1 }])).toThrow(RangeError);
  });
});
