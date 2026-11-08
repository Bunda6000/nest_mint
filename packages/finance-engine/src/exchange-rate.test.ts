import { describe, expect, it } from 'vitest';
import {
  convertMkdToEur,
  DEFAULT_MKD_PER_EUR,
  mkdToEurCents,
  rateOn,
  type RateEntry,
} from './exchange-rate';

describe('mkdToEurCents', () => {
  // Real rows of Budget.xlsx: the EUR column is `=C/61.5`, shown here in cents.
  it.each([
    ['Кирби 2023', 11_650, 18_943],
    ['Кирби 2024', 36_900, 60_000],
    ['Градинка 2023', 31_492, 51_207],
    ['Градинка 2024', 209_900, 341_301],
    ['Градинка 2025', 218_000, 354_472],
    ['Градинка 2026', 27_300, 44_390],
    ['empty year', 0, 0],
  ])('matches the spreadsheet: %s', (_row, mkd, cents) => {
    expect(mkdToEurCents(mkd)).toBe(cents);
    expect(mkdToEurCents(mkd, 61.5)).toBe(cents);
  });

  it('uses 61.5 by default', () => {
    expect(DEFAULT_MKD_PER_EUR).toBe(61.5);
    expect(mkdToEurCents(123)).toBe(200);
  });

  it('rounds to the nearest cent, halves away from zero', () => {
    // 1 MKD at rate 1.25 → 0.8 EUR → 80 cents exactly; at 8 → 12.5 cents → 13
    expect(mkdToEurCents(1, 1.25)).toBe(80);
    expect(mkdToEurCents(1, 8)).toBe(13);
    expect(mkdToEurCents(-1, 8)).toBe(-13);
    expect(mkdToEurCents(3, 8)).toBe(38); // 37.5 → 38
    expect(mkdToEurCents(1, 61.5)).toBe(2); // 1.626 → 2
  });

  it('is exact where floating point would drift', () => {
    // 0.1 + 0.2 style traps: 0.145 EUR is exactly 14.5 cents → 15, not 14
    expect(mkdToEurCents(29, 200)).toBe(15);
    expect(mkdToEurCents(1_000_000, 61.5)).toBe(1_626_016);
  });

  it('keeps the sign of a negative amount, e.g. a loss month', () => {
    expect(mkdToEurCents(-2_500)).toBe(-4_065);
  });

  it('handles the largest amount the app accepts', () => {
    expect(mkdToEurCents(100_000_000)).toBe(162_601_626);
  });

  it('rejects fractional denars and bad rates', () => {
    expect(() => mkdToEurCents(10.5)).toThrow(RangeError);
    expect(() => mkdToEurCents(100, 0)).toThrow(RangeError);
    expect(() => mkdToEurCents(100, -61.5)).toThrow(RangeError);
    expect(() => mkdToEurCents(100, Number.NaN)).toThrow(RangeError);
    expect(() => mkdToEurCents(100, 61.12345)).toThrow(RangeError);
  });

  it('accepts rates with up to 4 decimals', () => {
    // 10,000 ÷ 61.4963 = 162.6114… EUR
    expect(mkdToEurCents(10_000, 61.4963)).toBe(16_261);
  });
});

describe('rateOn', () => {
  const rates: RateEntry[] = [
    { effectiveFrom: '2025-06-01', mkdPerEur: 61.4 },
    { effectiveFrom: '2024-01-01', mkdPerEur: 61.6 },
    { effectiveFrom: '2026-01-01', mkdPerEur: 61.3 },
  ];

  it('falls back to 61.5 when nothing is set', () => {
    expect(rateOn('2026-11-08')).toBe(61.5);
    expect(rateOn('2026-11-08', [])).toBe(61.5);
  });

  it('falls back to 61.5 before the first entry', () => {
    expect(rateOn('2023-12-31', rates)).toBe(61.5);
  });

  it('picks the latest entry that has started, whatever the list order', () => {
    expect(rateOn('2024-01-01', rates)).toBe(61.6);
    expect(rateOn('2025-05-31', rates)).toBe(61.6);
    expect(rateOn('2025-06-01', rates)).toBe(61.4);
    expect(rateOn('2026-11-08', rates)).toBe(61.3);
  });

  it('lets the later entry win on the same date', () => {
    const same: RateEntry[] = [
      { effectiveFrom: '2025-01-01', mkdPerEur: 61 },
      { effectiveFrom: '2025-01-01', mkdPerEur: 62 },
    ];
    expect(rateOn('2025-03-01', same)).toBe(62);
  });

  it('rejects bad dates and bad entries', () => {
    expect(() => rateOn('08.11.2026')).toThrow(RangeError);
    expect(() => rateOn('2026-13-45')).toThrow(RangeError);
    expect(() => rateOn('2026-11-08', [{ effectiveFrom: 'x', mkdPerEur: 61 }])).toThrow(RangeError);
    expect(() => rateOn('2026-11-08', [{ effectiveFrom: '2026-01-01', mkdPerEur: 0 }])).toThrow(
      RangeError,
    );
  });
});

describe('convertMkdToEur', () => {
  it('uses the rate effective on the transaction date and says which one', () => {
    const rates: RateEntry[] = [{ effectiveFrom: '2026-01-01', mkdPerEur: 60 }];
    expect(convertMkdToEur(6_000, '2025-12-31', rates)).toEqual({ eurCents: 9_756, rate: 61.5 });
    expect(convertMkdToEur(6_000, '2026-01-01', rates)).toEqual({ eurCents: 10_000, rate: 60 });
  });

  it('works without any rates', () => {
    expect(convertMkdToEur(450, '2026-11-08')).toEqual({ eurCents: 732, rate: 61.5 });
  });
});
