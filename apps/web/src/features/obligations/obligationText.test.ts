import type { ObligationResponse } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { describeLate, describeObligation, describeWhen, formatDueDate } from './obligationText';

const base: ObligationResponse = {
  id: 'o1',
  name: 'Electricity',
  payee: 'EVN',
  categoryId: 'c1',
  categoryName: 'Electricity',
  expectedAmountMkd: 4_500,
  dueDay: 15,
  recurrence: 'monthly',
  everyNMonths: null,
  months: null,
  startMonth: '2026-01',
  endMonth: null,
  createdMonth: '2026-11',
  kind: 'bill',
  loan: null,
  installment: null,
  groupId: null,
  groupName: null,
};

describe('describeWhen', () => {
  it('says every month', () => {
    expect(describeWhen(base)).toBe('Every month');
  });

  it('says every n months', () => {
    expect(describeWhen({ ...base, recurrence: 'every_n_months', everyNMonths: 3 })).toBe(
      'Every 3 months',
    );
  });

  it('lists chosen months in calendar order, not the order they were given', () => {
    expect(describeWhen({ ...base, recurrence: 'custom_months', months: [12, 1, 11, 2] })).toBe(
      'Jan, Feb, Nov, Dec',
    );
  });
});

describe('describeObligation', () => {
  it('describes an ongoing monthly bill', () => {
    expect(describeObligation(base)).toBe(
      'Every month · due on the 15th · from January 2026 · ongoing',
    );
  });

  it('shows the end month and the right ordinal', () => {
    expect(describeObligation({ ...base, dueDay: 1, endMonth: '2026-12' })).toBe(
      'Every month · due on the 1st · from January 2026 · until December 2026',
    );
    expect(describeObligation({ ...base, dueDay: 22 })).toContain('due on the 22nd');
    expect(describeObligation({ ...base, dueDay: 13 })).toContain('due on the 13th');
  });
});

describe('formatDueDate', () => {
  it.each([
    ['2026-11-15', 'Nov 15'],
    ['2026-01-01', 'Jan 1'],
    ['2026-02-28', 'Feb 28'],
    ['2026-12-31', 'Dec 31'],
  ])('%s → %s', (dueDate, expected) => {
    expect(formatDueDate({ dueDate })).toBe(expected);
  });
});

describe('describeLate', () => {
  it('is empty when the bill is not late yet', () => {
    expect(describeLate('2026-11-15', '2026-11-01')).toBe('');
    expect(describeLate('2026-11-15', '2026-11-15')).toBe('');
  });

  it('says 1 day late in the singular and N days late otherwise', () => {
    expect(describeLate('2026-11-15', '2026-11-16')).toBe('1 day late');
    expect(describeLate('2026-11-15', '2026-11-25')).toBe('10 days late');
    expect(describeLate('2026-12-30', '2027-01-02')).toBe('3 days late');
  });
});
