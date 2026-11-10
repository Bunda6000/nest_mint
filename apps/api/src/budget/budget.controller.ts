import { Controller, Get, Query } from '@nestjs/common';
import type { BudgetGridResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { parseYearQuery } from '../common/year-query.js';
import { BudgetService } from './budget.service.js';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  /** `?year=2026` is required. */
  @Get()
  year(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: unknown,
  ): Promise<BudgetGridResponse> {
    return this.budget.year(user.id, parseYearQuery(year));
  }
}
