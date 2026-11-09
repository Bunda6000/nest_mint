import type { IncomeResponse } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { describeIncome, ordinal } from './incomeText';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [25, '25th'],
    [30, '30th'],
    [31, '31st'],
  ])('%i is %s', (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});

const base: IncomeResponse = {
  id: 'i1',
  name: 'Salary',
  amountMkd: 1,
  recurrence: 'monthly',
  receivedOn: null,
  startMonth: '2026-01',
  endMonth: null,
  payDay: 25,
};

describe('describeIncome', () => {
  it('describes an ongoing salary', () => {
    expect(describeIncome(base)).toBe('Every month on the 25th · from January 2026 · ongoing');
  });

  it('describes a salary that ended', () => {
    expect(describeIncome({ ...base, payDay: 1, endMonth: '2026-10' })).toBe(
      'Every month on the 1st · from January 2026 · until October 2026',
    );
  });

  it('describes one-off income with its date', () => {
    const bonus: IncomeResponse = {
      ...base,
      recurrence: 'one_off',
      receivedOn: '2026-11-03',
      startMonth: null,
      payDay: null,
    };
    expect(describeIncome(bonus)).toBe('One-off · Nov 3, 2026');
  });
});
