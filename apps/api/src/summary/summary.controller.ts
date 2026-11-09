import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ErrorCode, type MonthSummaryResponse, monthSchema } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
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
    const parsed = monthSchema.safeParse(month);
    if (!parsed.success) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { month: parsed.error.issues[0]!.message },
      );
    }
    return this.summary.month(user.id, parsed.data);
  }
}
