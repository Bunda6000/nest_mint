import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import {
  ErrorCode,
  type HistoryResponse,
  type MonthBreakdownResponse,
  monthSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { InsightsService } from './insights.service.js';

function parseMonth(month: unknown): string {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { month: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** `?month=2026-11` is required. */
  @Get('breakdown')
  breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<MonthBreakdownResponse> {
    return this.insights.breakdown(user.id, parseMonth(month));
  }

  /** `?month=2026-11` is the last of the twelve months. Required. */
  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<HistoryResponse> {
    return this.insights.history(user.id, parseMonth(month));
  }
}
