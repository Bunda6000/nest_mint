import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  type ForecastResponse,
  forecastQuerySchema,
  type ScenarioData,
  type ScenarioResponse,
  scenarioSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ForecastService } from './forecast.service.js';

@Controller('forecast')
export class ForecastController {
  constructor(private readonly forecast: ForecastService) {}

  /** `?months=12` (1 to 60, default 12). */
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('months') months?: string,
  ): Promise<ForecastResponse> {
    const parsed = new ZodValidationPipe<{ months: number }>(forecastQuerySchema).transform({
      months: months === undefined ? 12 : Number(months),
    });
    return this.forecast.forecast(user.id, parsed.months);
  }

  /** What-if: nothing is saved. */
  @Post('scenario')
  @HttpCode(HttpStatus.OK)
  scenario(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<ScenarioData>(scenarioSchema)) body: ScenarioData,
  ): Promise<ScenarioResponse> {
    return this.forecast.scenario(user.id, body);
  }
}
