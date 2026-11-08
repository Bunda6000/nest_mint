import { z } from 'zod';
import { amountMkdSchema, isoDateSchema, monthSchema } from './transactions.js';

/**
 * A salary that repeats every month is stored once (from a month, optionally until a month) and a
 * month's income is worked out from it, so no month can be missed or counted twice. Income that
 * happens once (a bonus, a refund) is stored with its date.
 */
export const INCOME_RECURRENCES = ['monthly', 'one_off'] as const;
export type IncomeRecurrence = (typeof INCOME_RECURRENCES)[number];

export const MAX_INCOME_NAME_LENGTH = 60;

/** Income as shown in lists. Amounts are whole denars. Fields of the other recurrence are null. */
export interface IncomeResponse {
  id: string;
  name: string;
  amountMkd: number;
  recurrence: IncomeRecurrence;
  /** One-off only: the day the money arrived, "YYYY-MM-DD". */
  receivedOn: string | null;
  /** Monthly only: the first month it counts in, "YYYY-MM". */
  startMonth: string | null;
  /** Monthly only: the last month it counts in, "YYYY-MM"; null while it goes on. */
  endMonth: string | null;
  /** Monthly only: the day of the month it arrives, 1 to 31 (short months use their last day). */
  payDay: number | null;
}

export interface IncomesResponse {
  incomes: IncomeResponse[];
}

const nameSchema = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_INCOME_NAME_LENGTH, `Name must be at most ${MAX_INCOME_NAME_LENGTH} characters`);

const payDaySchema = z
  .number({ error: 'Choose the day of the month' })
  .int('Choose the day of the month')
  .min(1, 'Pay day must be between 1 and 31')
  .max(31, 'Pay day must be between 1 and 31');

export const END_BEFORE_START = 'End month cannot be before the start month';

const monthlyIncome = z
  .object({
    recurrence: z.literal('monthly'),
    name: nameSchema,
    amountMkd: amountMkdSchema,
    startMonth: monthSchema,
    endMonth: monthSchema.nullable().optional(),
    payDay: payDaySchema,
  })
  .strict()
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    message: END_BEFORE_START,
    path: ['endMonth'],
  });

const oneOffIncome = z
  .object({
    recurrence: z.literal('one_off'),
    name: nameSchema,
    amountMkd: amountMkdSchema,
    receivedOn: isoDateSchema,
  })
  .strict();

export const createIncomeSchema = z.discriminatedUnion(
  'recurrence',
  [monthlyIncome, oneOffIncome],
  {
    error: 'Choose monthly or one-off',
  },
);

export type CreateIncomeInput = z.input<typeof createIncomeSchema>;
export type CreateIncomeData = z.output<typeof createIncomeSchema>;

/**
 * Change any of the fields. The recurrence cannot be changed (delete and add again), and which
 * fields apply depends on it: the API refuses a pay day on one-off income and so on.
 * To end a salary, set `endMonth`; to take the end away again, set it to null.
 */
export const updateIncomeSchema = z
  .object({
    name: nameSchema.optional(),
    amountMkd: amountMkdSchema.optional(),
    receivedOn: isoDateSchema.optional(),
    startMonth: monthSchema.optional(),
    endMonth: monthSchema.nullable().optional(),
    payDay: payDaySchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to change',
  });

export type UpdateIncomeInput = z.input<typeof updateIncomeSchema>;
export type UpdateIncomeData = z.output<typeof updateIncomeSchema>;
