import type {
  ExtraPaymentKind,
  LoanDetails,
  LoanType,
  ObligationGroupResponse,
  ObligationRecurrence,
  ObligationResponse,
  RateChangeResponse,
} from '@nestmint/shared';

export const OBLIGATIONS_REPOSITORY = Symbol('OBLIGATIONS_REPOSITORY');

export interface NewObligation {
  name: string;
  payee: string | null;
  categoryId: string;
  /** A group of the same user, or null/absent for a stand-alone obligation. */
  groupId?: string | null;
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
  /** Set for a loan (the payee is then the lender); null for a plain bill. */
  loan?: Omit<LoanDetails, 'rateChanges' | 'extraPayments'> | null;
  /** Set for an installment plan (`expectedAmountMkd` is then the regular installment). */
  installment?: { contractTotalMkd: number; firstInstallmentMkd: number } | null;
}

/** Only the fields that are present change. A `null` endMonth takes the end away, a `null` payee clears it. */
export interface ObligationChange {
  name?: string;
  payee?: string | null;
  categoryId?: string;
  /** `null` takes the obligation out of its group. */
  groupId?: string | null;
  expectedAmountMkd?: number;
  dueDay?: number;
  startMonth?: string;
  endMonth?: string | null;
  everyNMonths?: number;
  months?: number[];
  /** Loans only. */
  loanType?: LoanType;
  /** Loans only. */
  principalMkd?: number;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes obligations without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface ObligationsRepository {
  /** The database refuses a category that belongs to another user (composite foreign key). */
  create(userId: string, input: NewObligation): Promise<ObligationResponse>;

  /** All of the user's obligations in use (not archived), newest entered first; the service puts them in display order. */
  list(userId: string): Promise<ObligationResponse[]>;

  /** `null` when the user has no such obligation, or it is archived. */
  find(userId: string, id: string): Promise<ObligationResponse | null>;

  /** `null` when the user has no such obligation. */
  update(userId: string, id: string, change: ObligationChange): Promise<ObligationResponse | null>;

  /**
   * Adds new terms to a loan from a month on; an existing change for the same month is replaced.
   * `null` when the user has no such obligation (the service has checked it is a loan).
   */
  upsertRateChange(
    userId: string,
    id: string,
    change: RateChangeResponse,
  ): Promise<ObligationResponse | null>;

  /** Records money paid towards a loan. `null` when the user has no such obligation. */
  addExtraPayment(
    userId: string,
    id: string,
    payment: { paidOn: string; amountMkd: number; kind: ExtraPaymentKind },
  ): Promise<ObligationResponse | null>;

  /**
   * Deletes the obligation and its rate changes. Its bills must be gone already (the database
   * refuses otherwise). `false` when the user has no such obligation.
   */
  remove(userId: string, id: string): Promise<boolean>;

  /** Hides the obligation and stops it making bills. `false` when there is none in use. */
  archive(userId: string, id: string): Promise<boolean>;

  /** The user's groups by name. */
  listGroups(userId: string): Promise<ObligationGroupResponse[]>;

  /** `null` when the user has no such group. */
  findGroup(userId: string, id: string): Promise<ObligationGroupResponse | null>;

  createGroup(userId: string, name: string): Promise<ObligationGroupResponse>;

  /** `null` when the user has no such group. */
  renameGroup(userId: string, id: string, name: string): Promise<ObligationGroupResponse | null>;

  /**
   * Deletes a group that has no lines (archived ones count, since they still point at it).
   * `not_empty` leaves it alone.
   */
  removeGroup(userId: string, id: string): Promise<'removed' | 'not_found' | 'not_empty'>;
}
