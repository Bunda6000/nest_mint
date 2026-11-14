export const BALANCE_CHECK_INS_REPOSITORY = Symbol('BALANCE_CHECK_INS_REPOSITORY');

/** A saved check-in: what was typed. The figures worked out from it are not stored. */
export interface StoredCheckIn {
  /** "YYYY-MM". */
  month: string;
  closingMkd: number;
  /** Set only on a check-in that had no earlier one to start from. */
  openingMkd: number | null;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes check-ins without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface BalanceCheckInsRepository {
  find(userId: string, month: string): Promise<StoredCheckIn | null>;

  /** The latest check-in of a month before `month` ("YYYY-MM"), or `null`. */
  findBefore(userId: string, month: string): Promise<StoredCheckIn | null>;

  /** Creates the month's check-in or replaces the one that is there. */
  save(userId: string, checkIn: StoredCheckIn): Promise<void>;
}
