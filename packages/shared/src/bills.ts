import { z } from 'zod';
import { amountMkdSchema, isoDateSchema } from './transactions.js';

/** Paid once it has a payment; otherwise overdue when its due date has passed, else due. */
export const BILL_STATUSES = ['due', 'overdue', 'paid'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const MAX_BULK_PAY = 50;
export const MAX_INVOICE_REF_LENGTH = 60;
/** The Paid tab shows the most recent payments only; its count is always the full number. */
export const PAID_TAB_LIMIT = 50;

/** One bill: an obligation's amount due in one month. Created from the obligation, never twice. */
export interface BillResponse {
  id: string;
  obligationId: string;
  obligationName: string;
  payee: string | null;
  categoryId: string;
  categoryName: string;
  /** The month the bill belongs to, "YYYY-MM". */
  period: string;
  /** The date it is due, "YYYY-MM-DD". */
  dueDate: string;
  /** The obligation's expected amount when the bill was created. */
  expectedAmountMkd: number;
  /** The real amount from the invoice, once entered; null until then. */
  actualAmountMkd: number | null;
  /** The invoice reference, when entered. */
  invoiceRef: string | null;
  /** What the bill costs now: the amount paid if paid, else the actual, else the expected amount. */
  amountMkd: number;
  status: BillStatus;
  /** Paid only: the day it was paid, "YYYY-MM-DD". */
  paidOn: string | null;
  /** Paid only: the expense that records the payment (edit it on the Expenses screen). */
  transactionId: string | null;
}

export interface BillsResponse {
  bills: BillResponse[];
}

/** The result of making sure a month's bills exist. */
export interface GenerateBillsResponse {
  month: string;
  /** How many bills were new; 0 when the month already had all of them. */
  created: number;
}

/** The result of catching up: every bill due since each obligation was entered, up to next month. */
export interface SyncBillsResponse {
  created: number;
}

/** One tab of the bills inbox, with how many bills each tab holds. */
export interface BillsInboxResponse {
  tab: BillStatus;
  /** Due and Overdue: soonest due first. Paid: most recently paid first, at most `PAID_TAB_LIMIT`. */
  bills: BillResponse[];
  counts: Record<BillStatus, number>;
}

export const billStatusSchema = z.enum(BILL_STATUSES, {
  error: 'Choose due, overdue or paid',
});

/** Empty means no invoice reference. */
const invoiceRefSchema = z
  .string({ error: 'Enter the invoice reference' })
  .trim()
  .max(
    MAX_INVOICE_REF_LENGTH,
    `Invoice reference must be at most ${MAX_INVOICE_REF_LENGTH} characters`,
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

/** Pay one bill. The day defaults to today and the amount to what the bill costs now. */
export const payBillSchema = z
  .object({
    paidOn: isoDateSchema.optional(),
    amountMkd: amountMkdSchema.optional(),
  })
  .strict();

export type PayBillInput = z.input<typeof payBillSchema>;
export type PayBillData = z.output<typeof payBillSchema>;

/** Pay several bills on one day, each for what it costs now. All are paid or none. */
export const payBillsSchema = z
  .object({
    billIds: z
      .array(z.uuid('Choose bills from the list'), { error: 'Choose at least one bill' })
      .min(1, 'Choose at least one bill')
      .max(MAX_BULK_PAY, `Pay at most ${MAX_BULK_PAY} bills at once`)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each bill only once' }),
    paidOn: isoDateSchema.optional(),
  })
  .strict();

export type PayBillsInput = z.input<typeof payBillsSchema>;
export type PayBillsData = z.output<typeof payBillsSchema>;

/**
 * Enter what the invoice says before paying: the actual amount (replaces the expected one; null
 * takes it away again) and the invoice reference (empty or null clears it). Unpaid bills only.
 */
export const updateBillSchema = z
  .object({
    actualAmountMkd: amountMkdSchema.nullable().optional(),
    invoiceRef: invoiceRefSchema,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to change',
  });

export type UpdateBillInput = z.input<typeof updateBillSchema>;
export type UpdateBillData = z.output<typeof updateBillSchema>;
