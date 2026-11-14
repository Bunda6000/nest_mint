import { z } from 'zod';
import { monthSchema } from './transactions.js';

/** The most the main account can hold or owe, in whole denars. */
export const MAX_BALANCE_MKD = 1_000_000_000;

/**
 * One monthly check of the books against the bank (NM-31), for the main salary account only. The
 * period runs from the month after the previous check-in (or just this month for the first one)
 * to the end of `month`.
 */
export interface BalanceCheckInResponse {
  /** The month the check-in is for, "YYYY-MM". */
  month: string;
  /** The first month of the period it covers. */
  fromMonth: string;
  /** The balance at the start of the period: the previous check-in's closing balance, or typed in. */
  openingMkd: number;
  /** The balance at the end of the month, typed in from the bank. */
  closingMkd: number;
  incomeMkd: number;
  expensesMkd: number;
  /** opening + income − expenses. */
  expectedMkd: number;
  /** expected − closing: positive is spending that was never recorded. */
  untrackedMkd: number;
  /** Untracked spending is above 10 % of the income. */
  alert: boolean;
}

export interface BalanceCheckInStatusResponse {
  month: string;
  /** `null` until the month has been checked in. */
  checkIn: BalanceCheckInResponse | null;
  /** True when there is no earlier check-in, so the opening balance has to be typed in. */
  needsOpening: boolean;
}

const balanceSchema = (what: string) =>
  z
    .number({ error: `Enter ${what}` })
    .int('Enter whole denars, for example 52000')
    .min(-MAX_BALANCE_MKD, `Must be at least -${MAX_BALANCE_MKD.toLocaleString('en-US')}`)
    .max(MAX_BALANCE_MKD, `Must be at most ${MAX_BALANCE_MKD.toLocaleString('en-US')}`);

/**
 * Saves the check-in of a month, replacing an earlier one for the same month. The opening balance
 * is needed only for the first check-in; later ones start from the previous closing balance, and
 * an opening balance sent then is refused.
 */
export const saveBalanceCheckInSchema = z
  .object({
    closingBalanceMkd: balanceSchema('the balance'),
    openingBalanceMkd: balanceSchema('the opening balance').optional(),
  })
  .strict();

export type SaveBalanceCheckInInput = z.input<typeof saveBalanceCheckInSchema>;
export type SaveBalanceCheckInData = z.output<typeof saveBalanceCheckInSchema>;

export { monthSchema as balanceCheckInMonthSchema };
