import { z } from 'zod';

/** A rate that applies from a day onward, until a later one replaces it. */
export interface ExchangeRateResponse {
  /** "YYYY-MM-DD". */
  effectiveFrom: string;
  mkdPerEur: number;
}

export interface ExchangeRatesResponse {
  /** The rate used before the first entry: what Budget.xlsx hardcodes. */
  defaultMkdPerEur: number;
  /** Oldest first. */
  rates: ExchangeRateResponse[];
}

export const MIN_MKD_PER_EUR = 1;
export const MAX_MKD_PER_EUR = 1_000;

export const exchangeRateDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date like 2026-11-08')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a real date')
  .refine((v) => v >= '2000-01-01', 'Enter a date from 2000 on');

/** The rate in MKD per EUR, with at most 4 decimals (the engine keeps rates in 1/10,000). */
export const saveExchangeRateSchema = z
  .object({
    mkdPerEur: z
      .number({ error: 'Enter the rate' })
      .min(MIN_MKD_PER_EUR, `Must be at least ${MIN_MKD_PER_EUR}`)
      .max(MAX_MKD_PER_EUR, `Must be at most ${MAX_MKD_PER_EUR}`)
      .refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6, 'At most 4 decimals'),
  })
  .strict();

export type SaveExchangeRateData = z.output<typeof saveExchangeRateSchema>;
