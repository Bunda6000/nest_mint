import { DEFAULT_MKD_PER_EUR } from '@nestmint/finance-engine';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type ExchangeRateResponse,
  type ExchangeRatesResponse,
  exchangeRateDaySchema,
  type SaveExchangeRateData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import {
  EXCHANGE_RATES_REPOSITORY,
  type ExchangeRatesRepository,
} from './exchange-rates.repository.js';

/** A rate day from the URL: a real date from 2000 on, else a 400 naming the field. */
export function parseRateDay(value: unknown): string {
  const parsed = exchangeRateDaySchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { effectiveFrom: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(@Inject(EXCHANGE_RATES_REPOSITORY) private readonly rates: ExchangeRatesRepository) {}

  async list(userId: string): Promise<ExchangeRatesResponse> {
    return { defaultMkdPerEur: DEFAULT_MKD_PER_EUR, rates: await this.rates.list(userId) };
  }

  /** Sets the rate that applies from `effectiveFrom`, replacing one saved for the same day. */
  async save(
    userId: string,
    effectiveFrom: string,
    input: SaveExchangeRateData,
  ): Promise<ExchangeRateResponse> {
    const rate = { effectiveFrom, mkdPerEur: input.mkdPerEur };
    await this.rates.save(userId, rate);
    this.logger.log(`Exchange rate saved from ${effectiveFrom}`);
    return rate;
  }

  async delete(userId: string, effectiveFrom: string): Promise<void> {
    if (!(await this.rates.delete(userId, effectiveFrom))) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Rate not found.');
    }
  }
}
