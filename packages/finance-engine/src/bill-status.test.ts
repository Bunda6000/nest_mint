import { describe, expect, it } from 'vitest';
import { billAmount, billStatus, daysOverdue } from './bill-status.js';

const unpaid = (dueDate: string) => ({ paid: false, dueDate });

describe('billStatus', () => {
  it('is due before and on the due date', () => {
    expect(billStatus(unpaid('2026-11-15'), '2026-11-01')).toBe('due');
    expect(billStatus(unpaid('2026-11-15'), '2026-11-14')).toBe('due');
    expect(billStatus(unpaid('2026-11-15'), '2026-11-15')).toBe('due');
  });

  it('is overdue from the day after the due date', () => {
    expect(billStatus(unpaid('2026-11-15'), '2026-11-16')).toBe('overdue');
    expect(billStatus(unpaid('2026-11-15'), '2027-03-01')).toBe('overdue');
  });

  it('is paid whenever it has a payment, even long after the due date or before it', () => {
    expect(billStatus({ paid: true, dueDate: '2026-11-15' }, '2027-03-01')).toBe('paid');
    expect(billStatus({ paid: true, dueDate: '2026-11-15' }, '2026-11-01')).toBe('paid');
  });

  it('compares across month and year boundaries', () => {
    expect(billStatus(unpaid('2026-12-31'), '2027-01-01')).toBe('overdue');
    expect(billStatus(unpaid('2027-01-01'), '2026-12-31')).toBe('due');
    expect(billStatus(unpaid('2026-02-28'), '2026-03-01')).toBe('overdue');
  });

  it('refuses days that do not exist', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-11-1', 'today', '', '2026-11-31']) {
      expect(() => billStatus(unpaid('2026-11-15'), bad)).toThrow(RangeError);
      expect(() => billStatus(unpaid(bad), '2026-11-15')).toThrow(RangeError);
    }
  });
});

describe('daysOverdue', () => {
  it('counts the days after the due date', () => {
    expect(daysOverdue('2026-11-15', '2026-11-16')).toBe(1);
    expect(daysOverdue('2026-11-15', '2026-11-25')).toBe(10);
    expect(daysOverdue('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysOverdue('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is 0 when due that day or later', () => {
    expect(daysOverdue('2026-11-15', '2026-11-15')).toBe(0);
    expect(daysOverdue('2026-11-15', '2026-11-01')).toBe(0);
  });

  it('counts a leap day', () => {
    expect(daysOverdue('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysOverdue('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('refuses days that do not exist', () => {
    expect(() => daysOverdue('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => daysOverdue('2026-02-01', 'x')).toThrow(RangeError);
  });
});

describe('billAmount', () => {
  it('is the expected amount until something better is known', () => {
    expect(billAmount({ paidAmount: null, actualAmount: null, expectedAmount: 4_500 })).toBe(4_500);
  });

  it('is the actual amount once it is known', () => {
    expect(billAmount({ paidAmount: null, actualAmount: 4_820, expectedAmount: 4_500 })).toBe(
      4_820,
    );
  });

  it('is what was paid once it is paid, over the actual and the expected amount', () => {
    expect(billAmount({ paidAmount: 4_800, actualAmount: 4_820, expectedAmount: 4_500 })).toBe(
      4_800,
    );
    expect(billAmount({ paidAmount: 4_800, actualAmount: null, expectedAmount: 4_500 })).toBe(
      4_800,
    );
  });
});
