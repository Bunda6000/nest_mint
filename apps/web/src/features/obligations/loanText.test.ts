import { describe, expect, it } from 'vitest';
import {
  describeExtraPayment,
  describeLoan,
  estimateStillOwed,
  formatRateBp,
  parseRatePercent,
} from './loanText';

describe('parseRatePercent', () => {
  it.each([
    ['4.5', 450],
    ['4,5', 450],
    ['6', 600],
    ['0', 0],
    ['3.75', 375],
    ['  6.00 % ', 600],
    ['100', 10_000],
    ['0.05', 5],
    ['7.', 700],
  ])('reads %s as %i basis points', (text, basisPoints) => {
    expect(parseRatePercent(text)).toEqual({ status: 'ok', basisPoints });
  });

  it('says empty for an empty box', () => {
    expect(parseRatePercent('  ')).toEqual({ status: 'empty' });
  });

  it('refuses more than two decimals instead of rounding', () => {
    expect(parseRatePercent('4.567')).toMatchObject({ status: 'invalid' });
  });

  it('refuses text, negatives and more than 100', () => {
    expect(parseRatePercent('abc')).toMatchObject({ status: 'invalid' });
    expect(parseRatePercent('-1')).toMatchObject({ status: 'invalid' });
    expect(parseRatePercent('100.01')).toMatchObject({ status: 'invalid' });
    expect(parseRatePercent('101')).toMatchObject({ status: 'invalid' });
  });
});

describe('formatRateBp', () => {
  it('drops needless zeros', () => {
    expect(formatRateBp(450)).toBe('4.5 %');
    expect(formatRateBp(600)).toBe('6 %');
    expect(formatRateBp(0)).toBe('0 %');
    expect(formatRateBp(375)).toBe('3.75 %');
  });
});

describe('describeLoan', () => {
  it('names the type, the principal and the rate', () => {
    expect(
      describeLoan({
        loanType: 'housing',
        principalMkd: 3_000_000,
        annualRateBp: 350,
        rateChanges: [],
        extraPayments: [],
      }),
    ).toBe('Home loan · 3,000,000 MKD borrowed · 3.5 % a year');
  });
});

const simpleLoan = (over: object = {}) => ({
  expectedAmountMkd: 10_000,
  startMonth: '2026-01',
  endMonth: '2026-12',
  loan: {
    loanType: 'housing' as const,
    principalMkd: 120_000,
    annualRateBp: 0,
    rateChanges: [],
    extraPayments: [],
    ...over,
  },
});

describe('estimateStillOwed', () => {
  it("is what is left after this month's payment", () => {
    expect(estimateStillOwed(simpleLoan(), '2026-05')).toBe(70_000);
  });

  it('takes extra payments into account', () => {
    const extra = [{ id: 'e1', paidOn: '2026-03-10', amountMkd: 20_000, kind: 'extra' as const }];
    expect(estimateStillOwed(simpleLoan({ extraPayments: extra }), '2026-05')).toBe(50_000);
  });

  it('is null for a bill, a paid off loan and a loan that is over', () => {
    expect(estimateStillOwed({ ...simpleLoan(), loan: null }, '2026-05')).toBeNull();
    const payoff = [{ id: 'p', paidOn: '2026-04-01', amountMkd: 80_000, kind: 'payoff' as const }];
    expect(estimateStillOwed(simpleLoan({ extraPayments: payoff }), '2026-05')).toBeNull();
    expect(estimateStillOwed(simpleLoan(), '2026-12')).toBeNull();
  });
});

describe('describeExtraPayment', () => {
  it('names an extra payment and a payoff', () => {
    expect(
      describeExtraPayment({ id: 'a', paidOn: '2026-05-10', amountMkd: 20_000, kind: 'extra' }),
    ).toBe('Extra 20,000 MKD on 2026-05-10');
    expect(
      describeExtraPayment({ id: 'b', paidOn: '2026-11-05', amountMkd: 90_000, kind: 'payoff' }),
    ).toBe('Paid off on 2026-11-05 with 90,000 MKD');
  });
});
