import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type BillResponse,
  type BillsInboxResponse,
  type BillsResponse,
  type BillStatus,
  billStatusSchema,
  ErrorCode,
  type GenerateBillsResponse,
  type PayBillData,
  type PayBillsData,
  payBillSchema,
  payBillsSchema,
  type SyncBillsResponse,
  type UpdateBillData,
  updateBillSchema,
} from '@nestmint/shared';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { parseDayQuery } from '../common/day-query.js';
import { parseMonthQuery } from '../common/month-query.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BillsService } from './bills.service.js';

/** A payment with no body at all means "today, for the bill's amount". */
const payBody = new ZodValidationPipe<PayBillData>(
  z.preprocess((value) => value ?? {}, payBillSchema),
);

/** The `?tab=` of the inbox: due, overdue or paid; due when missing. */
function parseTabQuery(tab: unknown): BillStatus {
  if (tab === undefined) return 'due';
  const parsed = billStatusSchema.safeParse(tab);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { tab: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}

@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  /**
   * `?month=2026-11` is required. Only reads; use `POST /bills/generate` to create what is missing.
   * `?asOf=` (a day, default today) is the day "overdue" is measured on.
   */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: unknown,
    @Query('asOf') asOf?: unknown,
  ): Promise<BillsResponse> {
    return this.bills.list(user.id, parseMonthQuery(month), parseDayQuery(asOf, 'asOf'));
  }

  /** One tab of the inbox (`?tab=due|overdue|paid`, default due), with the counts of all tabs. */
  @Get('inbox')
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tab') tab?: unknown,
    @Query('asOf') asOf?: unknown,
  ): Promise<BillsInboxResponse> {
    return this.bills.inbox(user.id, parseTabQuery(tab), parseDayQuery(asOf, 'asOf'));
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

  /** Catches up: creates every missing bill from when each obligation was entered, up to next month. */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: AuthenticatedUser): Promise<SyncBillsResponse> {
    return this.bills.sync(user.id);
  }

  /** Pays several bills on one day, each for what it costs now. All or none. */
  @Post('pay')
  @HttpCode(HttpStatus.OK)
  payMany(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<PayBillsData>(payBillsSchema)) body: PayBillsData,
  ): Promise<BillsResponse> {
    return this.bills.payMany(user.id, body);
  }

  /** Pays one bill: creates the expense. Day defaults to today, amount to what the bill costs now. */
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(payBody) body: PayBillData,
  ): Promise<BillResponse> {
    return this.bills.pay(user.id, id, body);
  }

  /** Takes a payment back: the bill is unpaid again and its expense is deleted. */
  @Post(':id/undo-payment')
  @HttpCode(HttpStatus.OK)
  undoPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<BillResponse> {
    return this.bills.undoPayment(user.id, id);
  }

  /** Enter the actual amount and/or invoice reference of an unpaid bill. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateBillData>(updateBillSchema)) body: UpdateBillData,
  ): Promise<BillResponse> {
    return this.bills.update(user.id, id, body);
  }
}
