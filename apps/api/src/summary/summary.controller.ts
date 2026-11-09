import { Controller, Get, Query } from '@nestjs/common';
import type { MonthSummaryResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { parseMonthQuery } from '../common/month-query.js';
import { SummaryService } from './summary.service.js';

@Controller('summary')
export class SummaryController {
  constructor(private readonly summary: SummaryService) {}

  /** `?month=2026-11` is required. */
  @Get()
  month(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<MonthSummaryResponse> {
    return this.summary.month(user.id, parseMonthQuery(month));
  }
}
