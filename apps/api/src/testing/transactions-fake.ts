import type { TransactionResponse } from '@nestmint/shared';
import type {
  NewTransaction,
  TransactionChange,
  TransactionsRepository,
} from '../transactions/transactions.repository.js';

type Row = TransactionResponse & { userId: string; entered: number };

/** Keeps each user's transactions apart and lists newest first, like the real repository. */
export class InMemoryTransactions implements TransactionsRepository {
  readonly rows: Row[] = [];
  private entered = 0;

  /** `categoryName` stands in for the join the database does. */
  constructor(private readonly categoryName: (userId: string, categoryId: string) => string) {}

  async create(userId: string, input: NewTransaction): Promise<TransactionResponse> {
    const row: Row = {
      id: `tx-${this.rows.length + 1}`,
      userId,
      entered: this.entered++,
      kind: input.kind,
      categoryId: input.categoryId,
      categoryName: this.categoryName(userId, input.categoryId),
      amountMkd: input.amountMkd,
      occurredOn: input.occurredOn,
      note: input.note,
    };
    this.rows.push(row);
    return InMemoryTransactions.response(row);
  }

  private own(userId: string): Row[] {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.entered - a.entered);
  }

  async listRecent(userId: string, limit: number): Promise<TransactionResponse[]> {
    return this.own(userId)
      .slice(0, limit)
      .map((r) => InMemoryTransactions.response(r));
  }

  async listMonth(
    userId: string,
    month: string,
    categoryId?: string,
  ): Promise<TransactionResponse[]> {
    return this.own(userId)
      .filter((r) => r.occurredOn.startsWith(`${month}-`))
      .filter((r) => categoryId === undefined || r.categoryId === categoryId)
      .map((r) => InMemoryTransactions.response(r));
  }

  async find(userId: string, id: string): Promise<TransactionResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    return row ? InMemoryTransactions.response(row) : null;
  }

  async update(
    userId: string,
    id: string,
    change: TransactionChange,
  ): Promise<TransactionResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return null;
    if (change.categoryId !== undefined) {
      row.categoryId = change.categoryId;
      row.categoryName = this.categoryName(userId, change.categoryId);
    }
    if (change.amountMkd !== undefined) row.amountMkd = change.amountMkd;
    if (change.occurredOn !== undefined) row.occurredOn = change.occurredOn;
    if (change.note !== undefined) row.note = change.note;
    return InMemoryTransactions.response(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }

  private static response(row: TransactionResponse): TransactionResponse {
    const { id, kind, categoryId, categoryName, amountMkd, occurredOn, note } = row;
    return { id, kind, categoryId, categoryName, amountMkd, occurredOn, note };
  }
}
