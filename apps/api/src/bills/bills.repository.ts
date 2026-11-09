import type { BillResponse } from '@nestmint/shared';

export const BILLS_REPOSITORY = Symbol('BILLS_REPOSITORY');

export interface NewBill {
  obligationId: string;
  /** The month the bill belongs to, "YYYY-MM". */
  period: string;
  /** "YYYY-MM-DD", inside the period. */
  dueDate: string;
  /** Whole denars, above 0. */
  expectedAmountMkd: number;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes bills without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface BillsRepository {
  /**
   * Creates the bills that do not exist yet and leaves existing ones untouched (at most one bill per
   * obligation and month, enforced by the database, so two requests at once cannot make a duplicate).
   * Returns how many were new.
   */
  createMissing(userId: string, bills: NewBill[]): Promise<number>;

  /** The bills of one month, by due date, then by name. */
  listMonth(userId: string, month: string): Promise<BillResponse[]>;
}
