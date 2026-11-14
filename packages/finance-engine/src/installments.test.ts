import { describe, expect, it } from 'vitest';
import {
  addMonths,
  installmentAmountInMonth,
  installmentEndMonth,
  installmentPlan,
  installmentProgress,
  MAX_INSTALLMENTS,
} from './installments.js';

describe('installmentPlan', () => {
  it('is the first installment, regular ones and a smaller last one (the Кирби sheet)', () => {
    const plan = installmentPlan(153_750, 5_500, 3_075);
    expect(plan.amounts).toHaveLength(50);
    expect(plan.amounts[0]).toBe(5_500);
    expect(plan.amounts[1]).toBe(3_075);
    expect(plan.amounts[48]).toBe(3_075);
    expect(plan.amounts[49]).toBe(650);
    expect(plan.amounts.reduce((a, b) => a + b, 0)).toBe(153_750);
  });

  it('has no smaller last installment when the total divides evenly', () => {
    expect(installmentPlan(10_000, 1_000, 3_000).amounts).toEqual([1_000, 3_000, 3_000, 3_000]);
  });

  it('is one installment when the first covers the total', () => {
    expect(installmentPlan(5_000, 5_000, 1_000).amounts).toEqual([5_000]);
  });

  it('refuses nonsense and plans that are too long', () => {
    expect(() => installmentPlan(1_000, 2_000, 100)).toThrow(RangeError);
    expect(() => installmentPlan(0, 1, 1)).toThrow(RangeError);
    expect(() => installmentPlan(1_000, 0, 100)).toThrow(RangeError);
    expect(() => installmentPlan(1_000, 100, 1.5)).toThrow(RangeError);
    expect(() => installmentPlan(1_000_000, 1, 1)).toThrow(RangeError);
    expect(installmentPlan(MAX_INSTALLMENTS, 1, 1).amounts).toHaveLength(MAX_INSTALLMENTS);
  });
});

describe('addMonths', () => {
  it('counts across year boundaries', () => {
    expect(addMonths('2023-10', 0)).toBe('2023-10');
    expect(addMonths('2023-10', 2)).toBe('2023-12');
    expect(addMonths('2023-10', 3)).toBe('2024-01');
    expect(addMonths('2023-10', 49)).toBe('2027-11');
  });

  it('refuses a bad month or a negative count', () => {
    expect(() => addMonths('2023-13', 1)).toThrow(RangeError);
    expect(() => addMonths('2023-10', -1)).toThrow(RangeError);
  });
});

describe('installmentEndMonth and installmentAmountInMonth', () => {
  const plan = installmentPlan(153_750, 5_500, 3_075);

  it('ends in the month of the last installment', () => {
    expect(installmentEndMonth(plan, '2023-10')).toBe('2027-11');
  });

  it('gives each month its installment, and null outside the plan', () => {
    expect(installmentAmountInMonth(plan, '2023-10', '2023-10')).toBe(5_500);
    expect(installmentAmountInMonth(plan, '2023-10', '2023-11')).toBe(3_075);
    expect(installmentAmountInMonth(plan, '2023-10', '2027-10')).toBe(3_075);
    expect(installmentAmountInMonth(plan, '2023-10', '2027-11')).toBe(650);
    expect(installmentAmountInMonth(plan, '2023-10', '2027-12')).toBeNull();
    expect(installmentAmountInMonth(plan, '2023-10', '2023-09')).toBeNull();
  });
});

describe('installmentProgress', () => {
  const plan = installmentPlan(153_750, 5_500, 3_075);

  it('reproduces the spreadsheet: 28 installments paid leave 65,225 and 22 installments', () => {
    const paid = [5_500, ...Array<number>(27).fill(3_075)];
    expect(paid.reduce((a, b) => a + b, 0)).toBe(88_525);
    expect(installmentProgress(plan, paid)).toEqual({ remainingMkd: 65_225, installmentsLeft: 22 });
  });

  it('starts with everything left and ends at zero', () => {
    expect(installmentProgress(plan, [])).toEqual({ remainingMkd: 153_750, installmentsLeft: 50 });
    expect(installmentProgress(plan, plan.amounts)).toEqual({
      remainingMkd: 0,
      installmentsLeft: 0,
    });
  });

  it('goes by what was really paid, so an invoice that differed shows up', () => {
    expect(installmentProgress(plan, [6_000]).remainingMkd).toBe(147_750);
  });

  it('never goes below zero and refuses a bad amount', () => {
    expect(installmentProgress(plan, [200_000]).remainingMkd).toBe(0);
    expect(() => installmentProgress(plan, [0])).toThrow(RangeError);
  });
});
