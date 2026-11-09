import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import type { BillsResponse, GenerateBillsResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { parseMonthQuery } from '../common/month-query.js';
import { BillsService } from './bills.service.js';

@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  /** `?month=2026-11` is required. Only reads; use `POST /bills/generate` to create what is missing. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<BillsResponse> {
    return this.bills.list(user.id, parseMonthQuery(month));
  }

  /** Creates the month's bills that do not exist yet. `?month=2026-11` is required. */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<GenerateBillsResponse> {
    return this.bills.generate(user.id, parseMonthQuery(month));
  }
}
