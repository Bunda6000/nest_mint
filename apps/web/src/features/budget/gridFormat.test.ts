import { describe, expect, it } from 'vitest';
import { gridAmount, isOverPlan } from './gridFormat';

describe('gridAmount', () => {
  it('shows nothing as a dash, in either currency', () => {
    expect(gridAmount(0, 'MKD', '2026-01')).toBe('–');
    expect(gridAmount(0, 'EUR', '2026-01')).toBe('–');
  });

  it('shows denars as whole numbers with thousands separators and no unit', () => {
    expect(gridAmount(127_088, 'MKD', '2026-01')).toBe('127,088');
  });

  it('shows euros as whole numbers at the default rate (61.5)', () => {
    expect(gridAmount(61_500, 'EUR', '2026-01')).toBe('1,000');
    expect(gridAmount(6_150, 'EUR', '2026-05')).toBe('100');
    expect(gridAmount(127_088, 'EUR', '2026-01')).toBe('2,066');
  });

  it('uses a real minus sign for negative amounts', () => {
    expect(gridAmount(-6_150, 'MKD', '2026-01')).toBe('−6,150');
    expect(gridAmount(-61_500, 'EUR', '2026-01')).toBe('−1,000');
  });
});

describe('isOverPlan', () => {
  it('is true only when something was planned and more was spent', () => {
    expect(isOverPlan({ plannedMkd: 100, actualMkd: 101 })).toBe(true);
    expect(isOverPlan({ plannedMkd: 100, actualMkd: 100 })).toBe(false);
    expect(isOverPlan({ plannedMkd: 100, actualMkd: 0 })).toBe(false);
    expect(isOverPlan({ plannedMkd: 0, actualMkd: 1 })).toBe(true);
  });

  it('is never true without a plan', () => {
    expect(isOverPlan({ plannedMkd: null, actualMkd: 1_000_000 })).toBe(false);
  });
});
