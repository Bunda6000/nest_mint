import { z } from 'zod';

/** The largest single expense, in whole denars. Catches a slipped finger, not a real purchase. */
export const MAX_EXPENSE_MKD = 100_000_000;
export const MAX_NOTE_LENGTH = 200;
const EARLIEST_DATE = '2000-01-01';

/** A money movement as shown in lists. Amounts are whole denars; EUR is derived, not stored. */
export interface TransactionResponse {
  id: string;
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

export const createExpenseSchema = z.object({
  categoryId: z.uuid('Choose a category'),
  amountMkd: z
    .number({ error: 'Enter an amount' })
    .int('Enter whole denars, for example 1250')
    .min(1, 'Enter an amount above 0')
    .max(MAX_EXPENSE_MKD, `Amount must be at most ${MAX_EXPENSE_MKD.toLocaleString('en-US')}`),
  occurredOn: isoDateSchema,
  note: z
    .string()
    .trim()
    .max(MAX_NOTE_LENGTH, `Note must be at most ${MAX_NOTE_LENGTH} characters`)
    .optional(),
});

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;
export type CreateExpenseData = z.output<typeof createExpenseSchema>;
