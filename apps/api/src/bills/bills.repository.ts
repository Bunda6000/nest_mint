import type { GroupMonthTotal } from '@nestmint/shared';

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

/** A bill as stored. Whether it is paid, due or overdue is worked out by the service. */
export interface BillRecord {
  id: string;
  obligationId: string;
  obligationName: string;
  payee: string | null;
  categoryId: string;
  categoryName: string;
  period: string;
  dueDate: string;
  expectedAmountMkd: number;
  actualAmountMkd: number | null;
  invoiceRef: string | null;
  /** The expense that records the payment; `null` while the bill is unpaid. */
  paid: { transactionId: string; paidOn: string; amountMkd: number } | null;
}

/** One bill to pay: the day and the amount of the expense that is created for it. */
export interface Payment {
  billId: string;
  /** "YYYY-MM-DD". */
  paidOn: string;
  /** Whole denars, above 0. */
  amountMkd: number;
}

/** Only the fields that are present change. `null` takes the value away. */
export interface BillChange {
  actualAmountMkd?: number | null;
  invoiceRef?: string | null;
}

export type BillPaymentProblem = 'not_found' | 'already_paid' | 'not_paid';

/** Why a payment or an undo was refused; nothing was changed. */
export class BillPaymentError extends Error {
  constructor(
    readonly reason: BillPaymentProblem,
    readonly billId: string,
  ) {
    super(`Bill ${billId}: ${reason}`);
  }
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
  listMonth(userId: string, month: string): Promise<BillRecord[]>;

  /**
   * The expected amounts of the bills of each category group in each month from `fromMonth` to
   * `toMonth` (both "YYYY-MM", included), paid or not. Only group-months that have a bill.
   */
  sumExpectedByGroupAndMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<GroupMonthTotal[]>;

  /** Every bill of one obligation, any month, oldest period first. */
  listForObligation(userId: string, obligationId: string): Promise<BillRecord[]>;

  /** How many of the obligation's bills are paid. */
  countPaidForObligation(userId: string, obligationId: string): Promise<number>;

  /** Deletes the obligation's UNPAID bills (all months) and returns how many. Paid bills stay. */
  deleteUnpaidForObligation(userId: string, obligationId: string): Promise<number>;

  /** Deletes the obligation's UNPAID bills from a month on ("YYYY-MM", included); returns how many. */
  deleteUnpaidFromMonth(userId: string, obligationId: string, fromMonth: string): Promise<number>;

  /** Every unpaid bill, soonest due first (then by name). */
  listUnpaid(userId: string): Promise<BillRecord[]>;

  /** The `limit` most recently paid bills, latest payment first. */
  listPaid(userId: string, limit: number): Promise<BillRecord[]>;

  countPaid(userId: string): Promise<number>;

  /** `null` when the user has no such bill. */
  find(userId: string, id: string): Promise<BillRecord | null>;

  /**
   * Gives the UNPAID bills of one obligation, from `fromMonth` on ("YYYY-MM"), the expected amount
   * `amountForPeriod` returns for their month. Paid bills and the actual amounts (invoices) are not
   * touched. Returns how many bills changed.
   */
  setUnpaidExpectedAmounts(
    userId: string,
    obligationId: string,
    fromMonth: string,
    amountForPeriod: (period: string) => number,
  ): Promise<number>;

  /** Changes an UNPAID bill. `null` when the user has no such unpaid bill. */
  update(userId: string, id: string, change: BillChange): Promise<BillRecord | null>;

  /**
   * Pays the bills, all or none: for each one an expense is created in the bill's category and the
   * bill is linked to it, in one database transaction. A bill that is already paid (even by a
   * request a moment ago) is refused and nothing is paid. Throws `BillPaymentError`.
   * Returns the paid bills in the order given.
   */
  pay(userId: string, payments: Payment[]): Promise<BillRecord[]>;

  /**
   * Takes a payment back: the bill is unpaid again and its expense is deleted. Throws
   * `BillPaymentError` when the bill does not exist or is not paid.
   */
  undoPayment(userId: string, billId: string): Promise<BillRecord>;
}

/** The note of the expense a payment creates: the bill's name, plus the invoice reference if known. */
export function paymentNote(obligationName: string, invoiceRef: string | null): string {
  return invoiceRef ? `${obligationName} · ${invoiceRef}` : obligationName;
}
