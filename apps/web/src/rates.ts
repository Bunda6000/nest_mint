import {
  convertMkdToEur as convert,
  type EurConversion,
  type RateEntry,
} from '@nestmint/finance-engine';

let current: readonly RateEntry[] = [];

/** The user's saved rates, set once after login and again when they change in Settings. */
export function setRates(rates: readonly RateEntry[]): void {
  current = rates;
}

export const getRates = (): readonly RateEntry[] => current;

/** EUR for an amount in denars at the rate in force on `date` (the user's rates, else 61.5). */
export function convertMkdToEur(amount: number, date: string): EurConversion {
  return convert(amount, date, current);
}
