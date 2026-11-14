import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  type ExchangeRateResponse,
  type ExchangeRatesResponse,
  type SaveExchangeRateData,
  saveExchangeRateSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ExchangeRatesService, parseRateDay } from './exchange-rates.service.js';

@Controller('settings/rates')
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ExchangeRatesResponse> {
    return this.rates.list(user.id);
  }

  /** The rate that applies from the day in the URL ("2026-11-08"). */
  @Put(':effectiveFrom')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('effectiveFrom') effectiveFrom: string,
    @Body(new ZodValidationPipe<SaveExchangeRateData>(saveExchangeRateSchema))
    body: SaveExchangeRateData,
  ): Promise<ExchangeRateResponse> {
    return this.rates.save(user.id, parseRateDay(effectiveFrom), body);
  }

  @Delete(':effectiveFrom')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('effectiveFrom') effectiveFrom: string,
  ): Promise<void> {
    await this.rates.delete(user.id, parseRateDay(effectiveFrom));
  }
}
