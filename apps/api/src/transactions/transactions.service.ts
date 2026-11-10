import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateExpenseData,
  ErrorCode,
  type MonthTransactionsResponse,
  type TransactionResponse,
  type TransactionsResponse,
  type UpdateExpenseData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionChange,
  TransactionInUseError,
  type TransactionsRepository,
} from './transactions.repository.js';

export const DEFAULT_RECENT_LIMIT = 10;
export const MAX_RECENT_LIMIT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

const notFound = (what: string) =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, `${what} not found.`);

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
    private readonly clock: Clock,
  ) {}

  async createExpense(userId: string, input: CreateExpenseData): Promise<TransactionResponse> {
    await this.assertCategoryUsable(userId, input.categoryId);
    this.assertNotInTheFuture(input.occurredOn);

    return this.transactions.create(userId, {
      kind: input.kind ?? 'expense',
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

  /** A whole month, with the total of what is listed (so the total follows the category filter). */
  async listMonth(
    userId: string,
    month: string,
    categoryId?: string,
  ): Promise<MonthTransactionsResponse> {
    const transactions = await this.transactions.listMonth(userId, month, categoryId);
    const totalMkd = transactions.reduce((sum, t) => sum + t.amountMkd, 0);
    return { month, transactions, totalMkd };
  }

  /**
   * Changes an expense. Moving it to a different category needs an active one; keeping the same
   * category is always fine, even if that category was archived since.
   */
  async updateExpense(
    userId: string,
    id: string,
    input: UpdateExpenseData,
  ): Promise<TransactionResponse> {
    const existing = await this.transactions.find(userId, id);
    if (!existing) throw notFound('Transaction');

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await this.assertCategoryUsable(userId, input.categoryId);
    }
    if (input.occurredOn !== undefined) this.assertNotInTheFuture(input.occurredOn);

    const change: TransactionChange = {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.amountMkd !== undefined ? { amountMkd: input.amountMkd } : {}),
      ...(input.occurredOn !== undefined ? { occurredOn: input.occurredOn } : {}),
      ...(input.note !== undefined ? { note: input.note ? input.note : null } : {}),
    };
    const updated = await this.transactions.update(userId, id, change);
    if (!updated) throw notFound('Transaction');
    return updated;
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    try {
      if (!(await this.transactions.delete(userId, id))) throw notFound('Transaction');
    } catch (error) {
      if (error instanceof TransactionInUseError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.Conflict,
          'This expense is the payment of a bill. Undo the payment on the Bills screen first.',
        );
      }
      throw error;
    }
  }

  /** The category must be the user's own (else "not found") and not archived (else "conflict"). */
  private async assertCategoryUsable(userId: string, categoryId: string): Promise<void> {
    const category = await this.categories.findCategory(userId, categoryId);
    if (!category) throw notFound('Category');
    if (category.archived || category.groupArchived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This category is archived. Pick another one.',
      );
    }
  }

  /** One day of slack: the phone's "today" can be a day ahead of the server's UTC date. */
  private assertNotInTheFuture(day: string): void {
    const latest = new Date(this.clock.now().getTime() + DAY_MS).toISOString().slice(0, 10);
    if (day > latest) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { occurredOn: 'Date cannot be in the future' },
      );
    }
  }
}
