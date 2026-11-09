import type { TransactionKind, TransactionResponse } from '@nestmint/shared';

export const TRANSACTIONS_REPOSITORY = Symbol('TRANSACTIONS_REPOSITORY');

export interface NewTransaction {
  kind: TransactionKind;
  categoryId: string;
  /** Whole denars, above 0. */
  amountMkd: number;
  /** "YYYY-MM-DD". */
  occurredOn: string;
  note: string | null;
}

/** Only the fields that are present change. A `null` note clears it. */
export interface TransactionChange {
  categoryId?: string;
  amountMkd?: number;
  occurredOn?: string;
  note?: string | null;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes transactions without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface TransactionsRepository {
  /** The database refuses a category that belongs to another user (composite foreign key). */
  create(userId: string, input: NewTransaction): Promise<TransactionResponse>;

  /** Newest first: by date, then by when it was entered. */
  listRecent(userId: string, limit: number): Promise<TransactionResponse[]>;

  /** Every transaction of a calendar month ("YYYY-MM"), newest first, optionally of one category. */
  listMonth(userId: string, month: string, categoryId?: string): Promise<TransactionResponse[]>;

  /**
   * The total, in whole denars, of everything the user spent in a calendar month ("YYYY-MM"):
   * expenses and cash withdrawals alike. 0 when there is nothing.
   */
  sumMonth(userId: string, month: string): Promise<number>;

  /** `null` when the user has no such transaction. */
  find(userId: string, id: string): Promise<TransactionResponse | null>;

  /** `null` when the user has no such transaction. */
  update(
    userId: string,
    id: string,
    change: TransactionChange,
  ): Promise<TransactionResponse | null>;

  /** `false` when the user has no such transaction. Deletes exactly that one row. */
  delete(userId: string, id: string): Promise<boolean>;
}
