import type { IncomeRecurrence, IncomeResponse } from '@nestmint/shared';

export const INCOME_REPOSITORY = Symbol('INCOME_REPOSITORY');

export interface NewIncome {
  name: string;
  /** Whole denars, above 0. */
  amountMkd: number;
  recurrence: IncomeRecurrence;
  /** One-off only, "YYYY-MM-DD". */
  receivedOn: string | null;
  /** Monthly only, "YYYY-MM". */
  startMonth: string | null;
  endMonth: string | null;
  payDay: number | null;
}

/** Only the fields that are present change. A `null` endMonth takes the end away. */
export interface IncomeChange {
  name?: string;
  amountMkd?: number;
  receivedOn?: string;
  startMonth?: string;
  endMonth?: string | null;
  payDay?: number;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes income without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface IncomeRepository {
  create(userId: string, input: NewIncome): Promise<IncomeResponse>;

  /** All of the user's income, newest entered first; the service puts it in display order. */
  list(userId: string): Promise<IncomeResponse[]>;

  /** `null` when the user has no such income. */
  find(userId: string, id: string): Promise<IncomeResponse | null>;

  /** `null` when the user has no such income. */
  update(userId: string, id: string, change: IncomeChange): Promise<IncomeResponse | null>;

  /** `false` when the user has no such income. Deletes exactly that one row. */
  delete(userId: string, id: string): Promise<boolean>;
}
