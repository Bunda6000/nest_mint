import type { TransactionResponse } from '@nestmint/shared';

export const TRANSACTIONS_REPOSITORY = Symbol('TRANSACTIONS_REPOSITORY');

export interface NewTransaction {
  categoryId: string;
  /** Whole denars, above 0. */
  amountMkd: number;
  /** "YYYY-MM-DD". */
  occurredOn: string;
  note: string | null;
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
}
