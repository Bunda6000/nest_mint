import { z } from 'zod';
import { monthSchema } from './transactions.js';

/** One line of the Буџет sheet: a name and what was entered in each month. */
export interface ImportLineResponse {
  /** Identifies the line in the commit request: "section|name" (a repeat gets "#2", "#3"). */
  key: string;
  /** The block it sits in, for example "Дома" or "Транспорт". Income lines use "Приходи". */
  section: string;
  name: string;
  /** Whole denars by month "YYYY-MM"; months left empty in the sheet are not listed. */
  amountsMkd: Record<string, number>;
  totalMkd: number;
  /** The user's category with the same name, if there is exactly one. Income lines have none. */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
}

/** Something in the sheet that needs a person to confirm or fix it (NM-33). */
export interface ImportAnomalyResponse {
  /** `gap`: a month left empty between filled ones; `error_cell`: a cell showing an error such as #REF!; `negative`: a negative amount. */
  kind: 'gap' | 'error_cell' | 'negative';
  /** The line it belongs to, as `ImportLineResponse.key`. */
  lineKey: string;
  section: string;
  name: string;
  /** "YYYY-MM". */
  month: string;
  message: string;
}

/** What a budget workbook contains, shown before anything is saved (NM-32). */
export interface BudgetImportPreviewResponse {
  year: number;
  sheetName: string;
  income: ImportLineResponse[];
  expenses: ImportLineResponse[];
  incomeTotalMkd: number;
  expensesTotalMkd: number;
  /** Monthly totals worked out from the lines, "YYYY-MM". */
  monthlyIncomeMkd: Record<string, number>;
  monthlyExpensesMkd: Record<string, number>;
  /** To be confirmed or fixed one by one before the import is saved. */
  anomalies: ImportAnomalyResponse[];
  /** Things worth a look, for example a "Вкупно" row that does not match its lines. */
  warnings: string[];
}

export const BUDGET_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const MAX_LINES = 500;

/**
 * What the user decided in the review. Expense lines need a category (or `skip`); an anomaly is
 * resolved with a `fix`: an amount to use for that month, or 0 to confirm the month is empty.
 */
export const budgetImportDecisionsSchema = z
  .object({
    lines: z
      .record(
        z.string().min(1).max(200),
        z.object({ categoryId: z.uuid().optional(), skip: z.boolean().optional() }).strict(),
      )
      .refine((value) => Object.keys(value).length <= MAX_LINES, 'Too many lines'),
    fixes: z
      .array(
        z
          .object({
            lineKey: z.string().min(1).max(200),
            month: monthSchema,
            amountMkd: z.number().int().min(0).max(1_000_000_000),
          })
          .strict(),
      )
      .max(MAX_LINES * 12),
  })
  .strict();

export type BudgetImportDecisions = z.output<typeof budgetImportDecisionsSchema>;

export interface BudgetImportCommitResponse {
  year: number;
  incomeCreated: number;
  expensesCreated: number;
  incomeTotalMkd: number;
  expensesTotalMkd: number;
}
