import { describe, expect, it } from 'vitest';
import { describeLoan, formatRateBp, parseRatePercent } from './loanText';

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
    expect(describeLoan({ loanType: 'housing', principalMkd: 3_000_000, annualRateBp: 350 })).toBe(
      'Home loan · 3,000,000 MKD borrowed · 3.5 % a year',
    );
  });
});
