import { describe, expect, it } from 'vitest';
import { monthlySummary } from './monthly-summary';

describe('monthlySummary', () => {
  it('matches Budget.xlsx January 2025 (income 146,308, tracked expenses 82,272)', () => {
    const result = monthlySummary(146_308, 82_272);
    expect(result.net).toBe(64_036);
    expect(result.savingsRate).toBeCloseTo(0.4377, 4);
  });

  it('returns a null savings rate when income is 0', () => {
    expect(monthlySummary(0, 1_000).savingsRate).toBeNull();
  });

  it('allows a negative net month', () => {
    expect(monthlySummary(10_000, 12_500).net).toBe(-2_500);
  });

  it('rejects non-integer and negative amounts', () => {
    expect(() => monthlySummary(100.5, 0)).toThrow(RangeError);
    expect(() => monthlySummary(100, -1)).toThrow(RangeError);
  });
});
