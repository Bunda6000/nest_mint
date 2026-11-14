import type { ExchangeRateResponse } from '@nestmint/shared';

export const EXCHANGE_RATES_REPOSITORY = Symbol('EXCHANGE_RATES_REPOSITORY');

/**
 * Every method takes the owner's id and only ever touches that user's rows
 * (see docs/adr/006-user-data-isolation.md).
 */
export interface ExchangeRatesRepository {
  /** Oldest first. */
  list(userId: string): Promise<ExchangeRateResponse[]>;
  /** Creates the rate for the day or replaces the one that is there. */
  save(userId: string, rate: ExchangeRateResponse): Promise<void>;
  /** False when the user has no rate on that day. */
  delete(userId: string, effectiveFrom: string): Promise<boolean>;
}
