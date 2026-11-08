import { assertMoney, type Money } from './money';

/** What Budget.xlsx hardcodes in every EUR column (`=C3/61.5`). */
export const DEFAULT_MKD_PER_EUR = 61.5;

/** The most decimals a rate may have. Rates are handled as whole numbers of 1/10,000 to avoid float errors. */
const RATE_SCALE = 10_000;

/** A rate that applies from a date onward ("YYYY-MM-DD"), until a later entry replaces it. */
export interface RateEntry {
  effectiveFrom: string;
  mkdPerEur: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, field: string): string {
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RangeError(`${field} must be a date like 2026-11-08, got "${value}"`);
  }
  return value;
}

function scaledRate(rate: number): number {
  const scaled = Math.round(rate * RATE_SCALE);
  if (!(rate > 0) || Math.abs(rate * RATE_SCALE - scaled) > 1e-6) {
    throw new RangeError(`rate must be positive with at most 4 decimals, got ${rate}`);
  }
  return scaled;
}

/**
 * The MKD-per-EUR rate in force on `date`: the entry with the latest `effectiveFrom` that is not
 * after the date, or the default (61.5) when there is none. Later entries win on equal dates.
 */
export function rateOn(date: string, rates: readonly RateEntry[] = []): number {
  assertDate(date, 'date');
  let best: RateEntry | undefined;
  for (const entry of rates) {
    assertDate(entry.effectiveFrom, 'effectiveFrom');
    scaledRate(entry.mkdPerEur);
    if (entry.effectiveFrom <= date && (!best || entry.effectiveFrom >= best.effectiveFrom)) {
      best = entry;
    }
  }
  return best ? best.mkdPerEur : DEFAULT_MKD_PER_EUR;
}

/** n ÷ d rounded to the nearest whole number, halves away from zero. d must be positive. */
function divideRounded(n: number, d: number): number {
  const quotient = Math.floor(Math.abs(n) / d);
  const remainder = Math.abs(n) - quotient * d;
  const rounded = remainder * 2 >= d ? quotient + 1 : quotient;
  return n < 0 ? -rounded : rounded;
}

/**
 * Euro cents for an amount in whole denars at a rate (MKD per EUR): EUR = MKD ÷ rate, rounded to
 * the nearest cent, halves away from zero. Integer arithmetic only, so 1 MKD at 61.5 is always
 * 2 cents and never 1.9999999.
 */
export function mkdToEurCents(amount: Money, rate: number = DEFAULT_MKD_PER_EUR): number {
  assertMoney(amount);
  return divideRounded(amount * 100 * RATE_SCALE, scaledRate(rate));
}

export interface EurConversion {
  /** Whole euro cents. */
  eurCents: number;
  /** The MKD-per-EUR rate that was used. */
  rate: number;
}

/** EUR = MKD ÷ the rate effective on the transaction date (BR-05). */
export function convertMkdToEur(
  amount: Money,
  date: string,
  rates: readonly RateEntry[] = [],
): EurConversion {
  const rate = rateOn(date, rates);
  return { eurCents: mkdToEurCents(amount, rate), rate };
}
