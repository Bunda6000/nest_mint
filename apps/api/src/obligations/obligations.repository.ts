import type { ObligationRecurrence, ObligationResponse } from '@nestmint/shared';

export const OBLIGATIONS_REPOSITORY = Symbol('OBLIGATIONS_REPOSITORY');

export interface NewObligation {
  name: string;
  payee: string | null;
  categoryId: string;
  /** Whole denars, above 0. */
  expectedAmountMkd: number;
  dueDay: number;
  recurrence: ObligationRecurrence;
  /** Only for `every_n_months`, else null. */
  everyNMonths: number | null;
  /** Calendar months, 1 to 12; only for `custom_months`, else empty. */
  months: number[];
  /** "YYYY-MM". */
  startMonth: string;
  endMonth: string | null;
}

/** Only the fields that are present change. A `null` endMonth takes the end away, a `null` payee clears it. */
export interface ObligationChange {
  name?: string;
  payee?: string | null;
  categoryId?: string;
  expectedAmountMkd?: number;
  dueDay?: number;
  startMonth?: string;
  endMonth?: string | null;
  everyNMonths?: number;
  months?: number[];
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes obligations without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface ObligationsRepository {
  /** The database refuses a category that belongs to another user (composite foreign key). */
  create(userId: string, input: NewObligation): Promise<ObligationResponse>;

  /** All of the user's obligations, newest entered first; the service puts them in display order. */
  list(userId: string): Promise<ObligationResponse[]>;

  /** `null` when the user has no such obligation. */
  find(userId: string, id: string): Promise<ObligationResponse | null>;

  /** `null` when the user has no such obligation. */
  update(userId: string, id: string, change: ObligationChange): Promise<ObligationResponse | null>;
}
