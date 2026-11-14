import { z } from 'zod';
import { END_BEFORE_START } from './income.js';
import { amountMkdSchema, isoDateSchema, monthSchema } from './transactions.js';

/**
 * A recurring bill (an "obligation") is stored once with its schedule; the bills of each month are
 * created from it (see `bills.ts`). Monthly: every month from the start month. Every n months:
 * counted from the start month. Custom months: only in the chosen calendar months (heating season).
 */
export const OBLIGATION_RECURRENCES = ['monthly', 'every_n_months', 'custom_months'] as const;
export type ObligationRecurrence = (typeof OBLIGATION_RECURRENCES)[number];

export const MAX_OBLIGATION_NAME_LENGTH = 60;
export const MAX_PAYEE_LENGTH = 60;

/**
 * A plain recurring bill, a loan paid back in monthly instalments (see `createLoanSchema`), or a
 * purchase paid in instalments to the seller, with no interest (see `createInstallmentSchema`).
 */
export const OBLIGATION_KINDS = ['bill', 'loan', 'installment'] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/** What a loan was taken for: a home loan (Станбен), a consumer loan (Потрошувачки) or something else. */
export const LOAN_TYPES = ['housing', 'consumer', 'other'] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

/** The highest principal of a loan, in whole denars. */
export const MAX_LOAN_PRINCIPAL_MKD = 1_000_000_000;
/** The highest yearly rate of a loan: 100.00 %, in basis points (1 bp = 0.01 %). */
export const MAX_LOAN_RATE_BP = 10_000;

/** New terms of a loan from one month on: the rate and the payment the bank asks for. */
export interface RateChangeResponse {
  /** The first month the new terms apply, "YYYY-MM". */
  effectiveMonth: string;
  /** The new yearly rate in basis points. */
  annualRateBp: number;
  /** The new monthly payment, in whole denars. */
  monthlyPaymentMkd: number;
}

/** What an extra payment does to the schedule. A payoff always closes the loan. */
export const EXTRA_PAYMENT_KINDS = ['extra', 'payoff'] as const;
export type ExtraPaymentKind = (typeof EXTRA_PAYMENT_KINDS)[number];

/** Money paid on top of the regular payments, or the final payment that closes the loan. */
export interface ExtraPaymentResponse {
  id: string;
  /** The day it was paid, "YYYY-MM-DD". */
  paidOn: string;
  amountMkd: number;
  kind: ExtraPaymentKind;
}

/** What makes a loan different from a bill. The lender is the obligation's `payee`. */
export interface LoanDetails {
  loanType: LoanType;
  /** The amount borrowed, in whole denars. */
  principalMkd: number;
  /** The yearly interest rate in basis points at the start: 450 means 4.50 %. */
  annualRateBp: number;
  /**
   * Later rate changes, oldest first. The obligation's `expectedAmountMkd` and `annualRateBp` here
   * are the terms from the first month; the terms of any month come from the latest change that
   * has started by then.
   */
  rateChanges: RateChangeResponse[];
  /** Extra payments and a payoff, oldest first. */
  extraPayments: ExtraPaymentResponse[];
}

/**
 * What makes an installment plan different from a bill. The regular installment is the obligation's
 * `expectedAmountMkd`; the seller is its `payee`. One installment a month from the start month, the
 * last one being whatever is left of the contract total. Progress counts the bills really paid.
 */
export interface InstallmentDetails {
  /** What the whole purchase costs, in whole denars. */
  contractTotalMkd: number;
  /** The first, usually larger, installment, in whole denars. */
  firstInstallmentMkd: number;
  /** How many installments the plan has in all. */
  installmentCount: number;
  /** Installments paid so far and what they came to. */
  paidCount: number;
  paidMkd: number;
  /** The contract total less what was paid. */
  remainingMkd: number;
  /** Installments not paid yet. */
  installmentsLeft: number;
}

/** An obligation as shown in lists. Amounts are whole denars. Fields of the other recurrences are null. */
export interface ObligationResponse {
  id: string;
  name: string;
  /** Who is paid, such as "EVN"; null when not set. */
  payee: string | null;
  categoryId: string;
  categoryName: string;
  /** What the bill usually costs; each bill starts with this and the real amount can differ. */
  expectedAmountMkd: number;
  /** Day of the month it is due, 1 to 31 (short months use their last day). */
  dueDay: number;
  recurrence: ObligationRecurrence;
  /** Every n months, 2 to 12. Only for `every_n_months`. */
  everyNMonths: number | null;
  /** Calendar months it is due in, 1 = January, sorted. Only for `custom_months`. */
  months: number[] | null;
  /** The first month it can be due, "YYYY-MM". */
  startMonth: string;
  /** The last month it can be due, "YYYY-MM"; null while it goes on. */
  endMonth: string | null;
  /** The month it was entered, "YYYY-MM". Bills missed since then are created when catching up. */
  createdMonth: string;
  kind: ObligationKind;
  /** Only for loans (`kind` is "loan"); `expectedAmountMkd` is then the monthly payment. */
  loan: LoanDetails | null;
  /** Only for installment plans (`kind` is "installment"). */
  installment: InstallmentDetails | null;
}

export interface ObligationsResponse {
  obligations: ObligationResponse[];
}

const nameSchema = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_OBLIGATION_NAME_LENGTH, `Name must be at most ${MAX_OBLIGATION_NAME_LENGTH} characters`);

/** Empty means no payee. */
const payeeSchema = z
  .string({ error: 'Enter who is paid' })
  .trim()
  .max(MAX_PAYEE_LENGTH, `Payee must be at most ${MAX_PAYEE_LENGTH} characters`)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const categoryIdSchema = z.uuid('Choose a category');

const dueDaySchema = z
  .number({ error: 'Choose the day of the month' })
  .int('Choose the day of the month')
  .min(1, 'Due day must be between 1 and 31')
  .max(31, 'Due day must be between 1 and 31');

const everyNMonthsSchema = z
  .number({ error: 'Choose how many months' })
  .int('Choose how many months')
  .min(2, 'Choose between 2 and 12 months')
  .max(12, 'Choose between 2 and 12 months');

const monthsSchema = z
  .array(
    z
      .number({ error: 'Choose months from 1 to 12' })
      .int('Choose months from 1 to 12')
      .min(1, 'Choose months from 1 to 12')
      .max(12, 'Choose months from 1 to 12'),
    { error: 'Choose at least one month' },
  )
  .min(1, 'Choose at least one month')
  .transform((months) => [...new Set(months)].sort((a, b) => a - b));

const common = {
  name: nameSchema,
  payee: payeeSchema,
  categoryId: categoryIdSchema,
  expectedAmountMkd: amountMkdSchema,
  dueDay: dueDaySchema,
  startMonth: monthSchema,
  endMonth: monthSchema.nullable().optional(),
};

const endNotBeforeStart = (value: { startMonth: string; endMonth?: string | null }) =>
  !value.endMonth || value.endMonth >= value.startMonth;
const endRule = { message: END_BEFORE_START, path: ['endMonth'] };

const monthlyObligation = z
  .object({ recurrence: z.literal('monthly'), ...common })
  .strict()
  .refine(endNotBeforeStart, endRule);

const everyNMonthsObligation = z
  .object({
    recurrence: z.literal('every_n_months'),
    ...common,
    everyNMonths: everyNMonthsSchema,
  })
  .strict()
  .refine(endNotBeforeStart, endRule);

const customMonthsObligation = z
  .object({ recurrence: z.literal('custom_months'), ...common, months: monthsSchema })
  .strict()
  .refine(endNotBeforeStart, endRule);

export const createObligationSchema = z.discriminatedUnion(
  'recurrence',
  [monthlyObligation, everyNMonthsObligation, customMonthsObligation],
  { error: 'Choose monthly, every few months or chosen months' },
);

export type CreateObligationInput = z.input<typeof createObligationSchema>;
export type CreateObligationData = z.output<typeof createObligationSchema>;

const lenderSchema = z
  .string({ error: 'Enter the lender' })
  .trim()
  .min(1, 'Enter the lender')
  .max(MAX_PAYEE_LENGTH, `Lender must be at most ${MAX_PAYEE_LENGTH} characters`);

/**
 * A loan: paid every month from the first to the last month. Leave `monthlyPaymentMkd` out and the
 * API works it out as an annuity (a fixed payment) from the principal, rate and term; give it when
 * the bank's figure is known, since that is what really gets paid. The rate is in basis points
 * (450 = 4.50 %). Each month's payment becomes a bill like any other recurring bill.
 */
export const createLoanSchema = z
  .object({
    name: nameSchema,
    lender: lenderSchema,
    loanType: z.enum(LOAN_TYPES, { error: 'Choose the type of loan' }),
    principalMkd: z
      .number({ error: 'Enter the amount borrowed' })
      .int('Enter whole denars, for example 1250000')
      .min(1, 'Enter an amount above 0')
      .max(
        MAX_LOAN_PRINCIPAL_MKD,
        `Amount must be at most ${MAX_LOAN_PRINCIPAL_MKD.toLocaleString('en-US')}`,
      ),
    annualRateBp: z
      .number({ error: 'Enter the yearly interest rate' })
      .int('Use at most two decimals, for example 4.5')
      .min(0, 'Rate cannot be below 0')
      .max(MAX_LOAN_RATE_BP, 'Rate must be at most 100'),
    categoryId: categoryIdSchema,
    dueDay: dueDaySchema,
    startMonth: monthSchema,
    endMonth: monthSchema,
    monthlyPaymentMkd: amountMkdSchema.optional(),
  })
  .strict()
  .refine((value) => value.endMonth >= value.startMonth, {
    message: END_BEFORE_START,
    path: ['endMonth'],
  });

export type CreateLoanInput = z.input<typeof createLoanSchema>;
export type CreateLoanData = z.output<typeof createLoanSchema>;

export const MAX_CONTRACT_TOTAL_MKD = 1_000_000_000;

/**
 * An installment plan: a purchase paid to the seller in monthly installments from `startMonth`,
 * first `firstInstallmentMkd`, then `regularInstallmentMkd` each, and a smaller last one for what is
 * left of `contractTotalMkd`. The API works out the last month; each installment becomes a bill.
 */
export const createInstallmentSchema = z
  .object({
    name: nameSchema,
    payee: payeeSchema,
    categoryId: categoryIdSchema,
    dueDay: dueDaySchema,
    startMonth: monthSchema,
    contractTotalMkd: z
      .number({ error: 'Enter the contract total' })
      .int('Enter whole denars, for example 153750')
      .min(1, 'Enter an amount above 0')
      .max(
        MAX_CONTRACT_TOTAL_MKD,
        `Amount must be at most ${MAX_CONTRACT_TOTAL_MKD.toLocaleString('en-US')}`,
      ),
    firstInstallmentMkd: amountMkdSchema,
    regularInstallmentMkd: amountMkdSchema,
  })
  .strict()
  .refine((value) => value.firstInstallmentMkd <= value.contractTotalMkd, {
    message: 'The first installment cannot be more than the contract total',
    path: ['firstInstallmentMkd'],
  });

export type CreateInstallmentInput = z.input<typeof createInstallmentSchema>;
export type CreateInstallmentData = z.output<typeof createInstallmentSchema>;

/**
 * A rate change: from `effectiveMonth` on, the loan has this rate and this monthly payment (typed
 * in from the bank's letter, not worked out). Months before it keep what they had. A second change
 * for the same month replaces the first, which is how a mistake is corrected.
 */
export const createRateChangeSchema = z
  .object({
    effectiveMonth: monthSchema,
    annualRateBp: createLoanSchema.shape.annualRateBp,
    monthlyPaymentMkd: amountMkdSchema,
  })
  .strict();

export type CreateRateChangeInput = z.input<typeof createRateChangeSchema>;
export type CreateRateChangeData = z.output<typeof createRateChangeSchema>;

export const EXTRA_PAYMENT_EFFECTS = ['shorten', 'lower_payment', 'none'] as const;
export type ExtraPaymentEffect = (typeof EXTRA_PAYMENT_EFFECTS)[number];

/**
 * Extra money paid towards a loan on `paidOn`. It is also saved as an expense. `effect` says what
 * happens to the loan: `shorten` keeps the payment and ends the loan earlier, `lower_payment` keeps
 * the end date and needs the new monthly payment from the bank (`newMonthlyPaymentMkd`, from the
 * month after `paidOn`), `none` leaves the schedule alone.
 */
export const createExtraPaymentSchema = z
  .object({
    paidOn: isoDateSchema,
    amountMkd: amountMkdSchema,
    effect: z.enum(EXTRA_PAYMENT_EFFECTS, { error: 'Choose what the extra payment does' }),
    newMonthlyPaymentMkd: amountMkdSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.effect === 'lower_payment' && value.newMonthlyPaymentMkd === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['newMonthlyPaymentMkd'],
        message: 'Enter the new monthly payment',
      });
    }
    if (value.effect !== 'lower_payment' && value.newMonthlyPaymentMkd !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['newMonthlyPaymentMkd'],
        message: 'Only for a lower payment',
      });
    }
  });

export type CreateExtraPaymentInput = z.input<typeof createExtraPaymentSchema>;
export type CreateExtraPaymentData = z.output<typeof createExtraPaymentSchema>;

/**
 * Pays the loan off early: the amount from the bank, on a day. It is saved as an expense, the loan
 * ends in that month and its unpaid bills from that month on are removed.
 */
export const payOffLoanSchema = z
  .object({ paidOn: isoDateSchema, amountMkd: amountMkdSchema })
  .strict();

export type PayOffLoanInput = z.input<typeof payOffLoanSchema>;
export type PayOffLoanData = z.output<typeof payOffLoanSchema>;

/**
 * Change any of the fields. The recurrence cannot be changed (add a new obligation), and which
 * fields apply depends on it: the API refuses `months` on a monthly obligation and so on.
 * Bills that were already created keep their amount and due date. To end an obligation set
 * `endMonth`; to take the end away again set it to null; an empty payee clears it. A loan's payment
 * and rate are not changed here but with a rate change (`createRateChangeSchema`).
 */
export const updateObligationSchema = z
  .object({
    name: nameSchema.optional(),
    payee: payeeSchema,
    categoryId: categoryIdSchema.optional(),
    expectedAmountMkd: amountMkdSchema.optional(),
    dueDay: dueDaySchema.optional(),
    startMonth: monthSchema.optional(),
    endMonth: monthSchema.nullable().optional(),
    everyNMonths: everyNMonthsSchema.optional(),
    months: monthsSchema.optional(),
    /** Loans only. */
    loanType: z.enum(LOAN_TYPES, { error: 'Choose the type of loan' }).optional(),
    /** Loans only. */
    principalMkd: createLoanSchema.shape.principalMkd.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to change',
  });

export type UpdateObligationInput = z.input<typeof updateObligationSchema>;
export type UpdateObligationData = z.output<typeof updateObligationSchema>;
