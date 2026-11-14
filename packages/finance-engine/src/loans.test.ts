import { describe, expect, it } from 'vitest';
import { annuityPaymentMkd, loanTermMonths } from './loans.js';

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
