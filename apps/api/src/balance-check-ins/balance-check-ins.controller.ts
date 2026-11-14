import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  type BalanceCheckInResponse,
  type BalanceCheckInStatusResponse,
  type SaveBalanceCheckInData,
  saveBalanceCheckInSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { parseMonthQuery } from '../common/month-query.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BalanceCheckInsService } from './balance-check-ins.service.js';

@Controller('balance-check-ins')
export class BalanceCheckInsController {
  constructor(private readonly checkIns: BalanceCheckInsService) {}

  /** `?month=2026-11` is required. */
  @Get()
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
  ): Promise<BalanceCheckInStatusResponse> {
    return this.checkIns.status(user.id, parseMonthQuery(month));
  }

  @Put(':month')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('month') month: string,
    @Body(new ZodValidationPipe<SaveBalanceCheckInData>(saveBalanceCheckInSchema))
    body: SaveBalanceCheckInData,
  ): Promise<BalanceCheckInResponse> {
    return this.checkIns.save(user.id, parseMonthQuery(month), body);
  }
}
