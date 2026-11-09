import { Controller, Get, Query } from '@nestjs/common';
import type { HistoryResponse, MonthBreakdownResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { parseMonthQuery } from '../common/month-query.js';
import { InsightsService } from './insights.service.js';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** `?month=2026-11` is required. */
  @Get('breakdown')
  breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<MonthBreakdownResponse> {
    return this.insights.breakdown(user.id, parseMonthQuery(month));
  }

  /** `?month=2026-11` is the last of the twelve months. Required. */
  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<HistoryResponse> {
    return this.insights.history(user.id, parseMonthQuery(month));
  }
}
