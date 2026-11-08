import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  type CreateExpenseData,
  createExpenseSchema,
  type TransactionResponse,
  type TransactionsResponse,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TransactionsService } from './transactions.service.js';

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

  /** The newest transactions. `?limit=` is 1 to 50, default 10; anything else falls back to the default. */
  @Get()
  recent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<TransactionsResponse> {
    const parsed = limit !== undefined && /^\d+$/.test(limit) ? Number(limit) : undefined;
    return this.transactions.listRecent(user.id, parsed);
  }
}
