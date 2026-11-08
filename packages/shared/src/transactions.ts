import { z } from 'zod';

/** The largest single expense, in whole denars. Catches a slipped finger, not a real purchase. */
export const MAX_EXPENSE_MKD = 100_000_000;
export const MAX_NOTE_LENGTH = 200;
const EARLIEST_DATE = '2000-01-01';

/**
 * What kind of money movement it is. A cash withdrawal leaves the bank account and counts as an
 * expense (decision of 2026-11), but is tagged so the balance check-in can tell it apart.
 */
export const TRANSACTION_KINDS = ['expense', 'cash_withdrawal'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** A money movement as shown in lists. Amounts are whole denars; EUR is derived, not stored. */
export interface TransactionResponse {
  id: string;
  kind: TransactionKind;
  categoryId: string;
  categoryName: string;
  /** Whole denars, always above 0. */
  amountMkd: number;
  /** Calendar date of the spending, "YYYY-MM-DD". */
  occurredOn: string;
  note: string | null;
}

export interface TransactionsResponse {
  transactions: TransactionResponse[];
}

/** Everything in one calendar month ("YYYY-MM"), newest first, with the total of what is listed. */
export interface MonthTransactionsResponse extends TransactionsResponse {
  month: string;
  /** Whole denars: the sum of the listed transactions (so it follows the category filter). */
  totalMkd: number;
}

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
  .string({ error: 'Choose a date' })
  .min(1, 'Choose a date')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date')
  .refine(isRealDate, 'Choose a valid date')
  .refine((value) => value >= EARLIEST_DATE, 'Choose a date after 1999');

const categoryIdSchema = z.uuid('Choose a category');

/** Whole denars, 1 to 100,000,000. Shared by expenses and income. */
export const amountMkdSchema = z
  .number({ error: 'Enter an amount' })
  .int('Enter whole denars, for example 1250')
  .min(1, 'Enter an amount above 0')
  .max(MAX_EXPENSE_MKD, `Amount must be at most ${MAX_EXPENSE_MKD.toLocaleString('en-US')}`);

const noteSchema = z
  .string()
  .trim()
  .max(MAX_NOTE_LENGTH, `Note must be at most ${MAX_NOTE_LENGTH} characters`);

export const createExpenseSchema = z.object({
  categoryId: categoryIdSchema,
  amountMkd: amountMkdSchema,
  occurredOn: isoDateSchema,
  note: noteSchema.optional(),
  /** Defaults to a plain expense. */
  kind: z.enum(TRANSACTION_KINDS, { error: 'Choose expense or cash withdrawal' }).optional(),
});

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;
export type CreateExpenseData = z.output<typeof createExpenseSchema>;

/**
 * Change any of the fields; an empty or missing note clears it. The kind cannot be changed:
 * delete the entry and add it again instead.
 */
export const updateExpenseSchema = z
  .object({
    categoryId: categoryIdSchema.optional(),
    amountMkd: amountMkdSchema.optional(),
    occurredOn: isoDateSchema.optional(),
    note: noteSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to change',
  });

export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;
export type UpdateExpenseData = z.output<typeof updateExpenseSchema>;

/** A calendar month as "YYYY-MM", e.g. "2026-11". */
export const monthSchema = z
  .string({ error: 'Choose a month' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a valid month')
  .refine((value) => value >= '2000-01', 'Choose a month after 1999');
