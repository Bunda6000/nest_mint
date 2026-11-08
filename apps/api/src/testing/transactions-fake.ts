import type { TransactionResponse } from '@nestmint/shared';
import type {
  NewTransaction,
  TransactionsRepository,
} from '../transactions/transactions.repository.js';

/** Keeps each user's transactions apart and lists newest first, like the real repository. */
export class InMemoryTransactions implements TransactionsRepository {
  readonly rows: Array<TransactionResponse & { userId: string; entered: number }> = [];
  private entered = 0;

  /** `categoryName` stands in for the join the database does. */
  constructor(private readonly categoryName: (userId: string, categoryId: string) => string) {}

  async create(userId: string, input: NewTransaction): Promise<TransactionResponse> {
    const row = {
      id: `tx-${this.rows.length + 1}`,
      userId,
      entered: this.entered++,
      categoryId: input.categoryId,
      categoryName: this.categoryName(userId, input.categoryId),
      amountMkd: input.amountMkd,
      occurredOn: input.occurredOn,
      note: input.note,
    };
    this.rows.push(row);
    return InMemoryTransactions.response(row);
  }

  async listRecent(userId: string, limit: number): Promise<TransactionResponse[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.entered - a.entered)
      .slice(0, limit)
      .map(InMemoryTransactions.response);
  }

  private static response(row: TransactionResponse): TransactionResponse {
    const { id, categoryId, categoryName, amountMkd, occurredOn, note } = row;
    return { id, categoryId, categoryName, amountMkd, occurredOn, note };
  }
}
