/** One line of the Буџет sheet: a name and what was entered in each month. */
export interface ImportLineResponse {
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
  /** Things worth a look, for example a "Вкупно" row that does not match its lines. */
  warnings: string[];
}

export const BUDGET_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
