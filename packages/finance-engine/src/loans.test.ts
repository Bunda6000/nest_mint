import { describe, expect, it } from 'vitest';
import {
  annuityPaymentMkd,
  balanceAtStartOfMonth,
  loanSchedule,
  loanTermMonths,
  loanTermsInMonth,
  suggestedPaymentMkd,
  type LoanDefinition,
  type RateChange,
} from './loans.js';

describe('loanTermMonths', () => {
  it('counts the first and the last month', () => {
    expect(loanTermMonths('2026-01', '2026-01')).toBe(1);
    expect(loanTermMonths('2026-01', '2026-12')).toBe(12);
  });

  it('counts across year boundaries', () => {
    expect(loanTermMonths('2026-11', '2027-02')).toBe(4);
    expect(loanTermMonths('2026-01', '2035-12')).toBe(120);
  });

  it('refuses an end before the start and bad months', () => {
    expect(() => loanTermMonths('2026-05', '2026-04')).toThrow(RangeError);
    expect(() => loanTermMonths('2026-13', '2027-01')).toThrow(RangeError);
    expect(() => loanTermMonths('2026-01', '2026-1')).toThrow(RangeError);
  });
});

describe('annuityPaymentMkd', () => {
  it('matches the standard annuity: 1,000,000 at 6 % over 120 months is 11,102', () => {
    expect(annuityPaymentMkd(1_000_000, 600, 120)).toBe(11_102);
  });

  it('matches a mortgage-sized example: 3,000,000 at 3.5 % over 240 months is 17,399', () => {
    expect(annuityPaymentMkd(3_000_000, 350, 240)).toBe(17_399);
  });

  it('splits the principal evenly at 0 %', () => {
    expect(annuityPaymentMkd(120_000, 0, 12)).toBe(10_000);
    expect(annuityPaymentMkd(100_000, 0, 3)).toBe(33_333);
  });

  it('is the principal for a one-month loan at any rate, apart from one month of interest', () => {
    expect(annuityPaymentMkd(50_000, 0, 1)).toBe(50_000);
    expect(annuityPaymentMkd(12_000, 1_200, 1)).toBe(12_120);
  });

  it('costs more per month at a higher rate and less over a longer term', () => {
    const base = annuityPaymentMkd(600_000, 500, 60);
    expect(annuityPaymentMkd(600_000, 900, 60)).toBeGreaterThan(base);
    expect(annuityPaymentMkd(600_000, 500, 120)).toBeLessThan(base);
  });

  it('refuses amounts, rates and terms that make no sense', () => {
    expect(() => annuityPaymentMkd(0, 500, 12)).toThrow(RangeError);
    expect(() => annuityPaymentMkd(1.5, 500, 12)).toThrow(RangeError);
    expect(() => annuityPaymentMkd(100_000, -1, 12)).toThrow(RangeError);
    expect(() => annuityPaymentMkd(100_000, 10_001, 12)).toThrow(RangeError);
    expect(() => annuityPaymentMkd(100_000, 4.5, 12)).toThrow(RangeError);
    expect(() => annuityPaymentMkd(100_000, 500, 0)).toThrow(RangeError);
  });
});

const initial = { annualRateBp: 600, monthlyPaymentMkd: 11_102 };
const change = (effectiveMonth: string, annualRateBp: number, monthlyPaymentMkd: number) =>
  ({ effectiveMonth, annualRateBp, monthlyPaymentMkd }) satisfies RateChange;

const tenYears = (changes: RateChange[] = []): LoanDefinition => ({
  principalMkd: 1_000_000,
  startMonth: '2026-01',
  endMonth: '2035-12',
  initial,
  changes,
});

describe('loanTermsInMonth', () => {
  it('uses the first terms before any change and the latest started change after', () => {
    const changes = [change('2028-01', 700, 12_000), change('2030-06', 500, 10_000)];
    expect(loanTermsInMonth(initial, changes, '2027-12')).toEqual(initial);
    expect(loanTermsInMonth(initial, changes, '2028-01')).toEqual({
      annualRateBp: 700,
      monthlyPaymentMkd: 12_000,
    });
    expect(loanTermsInMonth(initial, changes, '2030-05').annualRateBp).toBe(700);
    expect(loanTermsInMonth(initial, changes, '2030-06').annualRateBp).toBe(500);
    expect(loanTermsInMonth(initial, changes, '2035-12').annualRateBp).toBe(500);
  });

  it('does not depend on the order of the changes', () => {
    const changes = [change('2030-06', 500, 10_000), change('2028-01', 700, 12_000)];
    expect(loanTermsInMonth(initial, changes, '2029-01').annualRateBp).toBe(700);
  });

  it('lets a change in the first month replace the first terms', () => {
    expect(
      loanTermsInMonth(initial, [change('2026-01', 400, 9_000)], '2026-01').monthlyPaymentMkd,
    ).toBe(9_000);
  });
});

describe('loanSchedule', () => {
  it('pays a 10-year loan off in 120 months, the last payment near the regular one', () => {
    const rows = loanSchedule(tenYears());
    expect(rows).toHaveLength(120);
    expect(rows[0]).toEqual({
      month: '2026-01',
      openingMkd: 1_000_000,
      interestMkd: 5_000,
      paymentMkd: 11_102,
      closingMkd: 993_898,
    });
    const last = rows[119]!;
    expect(last.month).toBe('2035-12');
    expect(last.closingMkd).toBe(0);
    expect(Math.abs(last.paymentMkd - 11_102)).toBeLessThanOrEqual(30);
  });

  it('keeps every row consistent: owed + interest − payment = owed next month', () => {
    const rows = loanSchedule(tenYears([change('2029-03', 800, 12_500)]));
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      expect(row.openingMkd + row.interestMkd - row.paymentMkd).toBe(row.closingMkd);
      if (i > 0) expect(row.openingMkd).toBe(rows[i - 1]!.closingMkd);
    }
  });

  it('leaves the months before a rate change untouched and uses the new terms from it', () => {
    const base = loanSchedule(tenYears());
    const changed = loanSchedule(tenYears([change('2029-03', 800, 12_500)]));
    const before = changed.filter((r) => r.month < '2029-03');
    expect(before).toEqual(base.slice(0, before.length));
    const row = changed.find((r) => r.month === '2029-03')!;
    expect(row.interestMkd).toBe(Math.round((row.openingMkd * 800) / 120_000));
    expect(row.paymentMkd).toBe(12_500);
  });

  it('ends early when a higher payment pays the loan off, and has no rows afterwards', () => {
    const rows = loanSchedule(tenYears([change('2026-02', 600, 500_000)]));
    expect(rows.length).toBeLessThan(5);
    expect(rows[rows.length - 1]!.closingMkd).toBe(0);
  });

  it('puts what is left in the last month when the payment is too low', () => {
    const rows = loanSchedule({
      principalMkd: 100_000,
      startMonth: '2026-01',
      endMonth: '2026-04',
      initial: { annualRateBp: 0, monthlyPaymentMkd: 10_000 },
      changes: [],
    });
    expect(rows.map((r) => r.paymentMkd)).toEqual([10_000, 10_000, 10_000, 70_000]);
    expect(rows[3]!.closingMkd).toBe(0);
  });

  it('refuses a bad principal', () => {
    expect(() => loanSchedule({ ...tenYears(), principalMkd: 0 })).toThrow(RangeError);
  });
});

describe('balanceAtStartOfMonth', () => {
  it('is the principal at and before the first month', () => {
    expect(balanceAtStartOfMonth(tenYears(), '2026-01')).toBe(1_000_000);
    expect(balanceAtStartOfMonth(tenYears(), '2025-06')).toBe(1_000_000);
  });

  it('is what is left after the earlier payments', () => {
    expect(balanceAtStartOfMonth(tenYears(), '2026-02')).toBe(993_898);
  });

  it('is 0 after the loan is paid off', () => {
    expect(balanceAtStartOfMonth(tenYears(), '2036-06')).toBe(0);
  });
});

describe('suggestedPaymentMkd', () => {
  it('suggests the payment that pays off what is left over the months left at the new rate', () => {
    const loan = tenYears();
    const owed = balanceAtStartOfMonth(loan, '2030-01');
    expect(suggestedPaymentMkd(loan, '2030-01', 800)).toBe(annuityPaymentMkd(owed, 800, 72));
  });

  it('suggests the same payment when the rate does not change', () => {
    const suggested = suggestedPaymentMkd(tenYears(), '2030-01', 600)!;
    expect(Math.abs(suggested - 11_102)).toBeLessThanOrEqual(2);
  });

  it('is null when nothing is left or the month is after the end', () => {
    expect(suggestedPaymentMkd(tenYears(), '2036-01', 600)).toBeNull();
    expect(
      suggestedPaymentMkd(tenYears([change('2026-02', 600, 500_000)]), '2027-01', 600),
    ).toBeNull();
  });
});
