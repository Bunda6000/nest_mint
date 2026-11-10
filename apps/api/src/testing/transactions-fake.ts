import type { CategoryTotalResponse, GroupMonthTotal, TransactionResponse } from '@nestmint/shared';
import {
  type NewTransaction,
  type TransactionChange,
  TransactionInUseError,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

type Row = TransactionResponse & { userId: string; entered: number };

/** Keeps each user's transactions apart and lists newest first, like the real repository. */
export class InMemoryTransactions implements TransactionsRepository {
  readonly rows: Row[] = [];
  private entered = 0;
  private issued = 0;
  /** Ids that a bill points at; like the foreign key, they cannot be deleted. */
  readonly locked = new Set<string>();

  /** `categoryName` and `groupOf` stand in for the joins the database does. */
  constructor(
    private readonly categoryName: (userId: string, categoryId: string) => string,
    private readonly groupOf: (
      userId: string,
      categoryId: string,
    ) => { id: string; name: string } = () => ({ id: 'group-1', name: 'Group' }),
  ) {}

  async create(userId: string, input: NewTransaction): Promise<TransactionResponse> {
    const row: Row = {
      id: `tx-${++this.issued}`,
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

  async sumMonth(userId: string, month: string): Promise<number> {
    return this.own(userId)
      .filter((r) => r.occurredOn.startsWith(`${month}-`))
      .reduce((sum, r) => sum + r.amountMkd, 0);
  }

  async sumByGroupAndMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<GroupMonthTotal[]> {
    const totals = new Map<string, GroupMonthTotal>();
    for (const r of this.own(userId)) {
      const month = r.occurredOn.slice(0, 7);
      if (month < fromMonth || month > toMonth) continue;
      const group = this.groupOf(userId, r.categoryId);
      const key = `${group.id}|${month}`;
      const known = totals.get(key);
      totals.set(key, {
        month,
        groupId: group.id,
        groupName: group.name,
        amountMkd: (known?.amountMkd ?? 0) + r.amountMkd,
      });
    }
    return [...totals.values()];
  }

  async sumByCategory(userId: string, month: string): Promise<CategoryTotalResponse[]> {
    const totals = new Map<string, number>();
    for (const r of this.own(userId).filter((r) => r.occurredOn.startsWith(`${month}-`))) {
      totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amountMkd);
    }
    return [...totals]
      .map(([categoryId, amountMkd]) => {
        const group = this.groupOf(userId, categoryId);
        return {
          categoryId,
          categoryName: this.categoryName(userId, categoryId),
          groupId: group.id,
          groupName: group.name,
          amountMkd,
        };
      })
      .sort((a, b) => b.amountMkd - a.amountMkd || a.categoryName.localeCompare(b.categoryName));
  }

  async listBiggest(userId: string, month: string, limit: number): Promise<TransactionResponse[]> {
    return this.own(userId)
      .filter((r) => r.occurredOn.startsWith(`${month}-`))
      .sort(
        (a, b) =>
          b.amountMkd - a.amountMkd ||
          b.occurredOn.localeCompare(a.occurredOn) ||
          b.entered - a.entered,
      )
      .slice(0, limit)
      .map((r) => InMemoryTransactions.response(r));
  }

  async sumByMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const r of this.own(userId)) {
      const month = r.occurredOn.slice(0, 7);
      if (month >= fromMonth && month <= toMonth) {
        result[month] = (result[month] ?? 0) + r.amountMkd;
      }
    }
    return result;
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
    if (this.locked.has(id)) throw new TransactionInUseError();
    this.rows.splice(index, 1);
    return true;
  }

  private static response(row: TransactionResponse): TransactionResponse {
    const { id, kind, categoryId, categoryName, amountMkd, occurredOn, note } = row;
    return { id, kind, categoryId, categoryName, amountMkd, occurredOn, note };
  }
}
