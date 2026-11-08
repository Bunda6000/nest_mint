import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateExpenseData,
  createExpenseSchema,
  ErrorCode,
  type MonthTransactionsResponse,
  monthSchema,
  type TransactionResponse,
  type TransactionsResponse,
  type UpdateExpenseData,
  updateExpenseSchema,
} from '@nestmint/shared';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TransactionsService } from './transactions.service.js';

const invalid = (details: Record<string, string>) =>
  new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.ValidationFailed,
    'Some fields are invalid.',
    details,
  );

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateExpenseData>(createExpenseSchema)) body: CreateExpenseData,
  ): Promise<TransactionResponse> {
    return this.transactions.createExpense(user.id, body);
  }

  /**
   * Without `month`: the newest transactions, `?limit=` 1 to 50 (default 10; anything else falls
   * back to the default). With `?month=2026-11`: that whole month plus its total, optionally of
   * one category (`&categoryId=`), which is only allowed together with a month.
   */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('month') month?: unknown,
    @Query('categoryId') categoryId?: unknown,
  ): Promise<TransactionsResponse | MonthTransactionsResponse> {
    if (month === undefined) {
      if (categoryId !== undefined) throw invalid({ month: 'Choose a month' });
      const parsed = limit !== undefined && /^\d+$/.test(limit) ? Number(limit) : undefined;
      return this.transactions.listRecent(user.id, parsed);
    }

    const parsedMonth = monthSchema.safeParse(month);
    if (!parsedMonth.success) throw invalid({ month: parsedMonth.error.issues[0]!.message });
    if (categoryId !== undefined && !z.uuid().safeParse(categoryId).success) {
      throw invalid({ categoryId: 'Choose a category' });
    }
    return this.transactions.listMonth(
      user.id,
      parsedMonth.data,
      categoryId === undefined ? undefined : (categoryId as string),
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateExpenseData>(updateExpenseSchema)) body: UpdateExpenseData,
  ): Promise<TransactionResponse> {
    return this.transactions.updateExpense(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.transactions.deleteExpense(user.id, id);
  }
}
