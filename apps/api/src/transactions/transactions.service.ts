import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateExpenseData,
  ErrorCode,
  type TransactionResponse,
  type TransactionsResponse,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from './transactions.repository.js';

export const DEFAULT_RECENT_LIMIT = 10;
export const MAX_RECENT_LIMIT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
    private readonly clock: Clock,
  ) {}

  async createExpense(userId: string, input: CreateExpenseData): Promise<TransactionResponse> {
    const category = await this.categories.findCategory(userId, input.categoryId);
    if (!category) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Category not found.');
    }
    if (category.archived || category.groupArchived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This category is archived. Pick another one.',
      );
    }

    // One day of slack: the phone's "today" can be a day ahead of the server's UTC date.
    const latest = new Date(this.clock.now().getTime() + DAY_MS).toISOString().slice(0, 10);
    if (input.occurredOn > latest) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { occurredOn: 'Date cannot be in the future' },
      );
    }

    return this.transactions.create(userId, {
      categoryId: input.categoryId,
      amountMkd: input.amountMkd,
      occurredOn: input.occurredOn,
      note: input.note ? input.note : null,
    });
  }

  async listRecent(userId: string, requested?: number): Promise<TransactionsResponse> {
    const wanted = Number.isInteger(requested) ? (requested as number) : DEFAULT_RECENT_LIMIT;
    const limit = Math.min(Math.max(wanted, 1), MAX_RECENT_LIMIT);
    return { transactions: await this.transactions.listRecent(userId, limit) };
  }
}
