import type { BudgetImportPreviewResponse } from '@nestmint/shared';

/** A worksheet as rows of cell values; row 0 and column 0 are row 1 and column A. */
export type Grid = readonly (readonly unknown[])[];

const MONTH_NAMES = [
  'јануари',
  'февруари',
  'март',
  'април',
  'мај',
  'јуни',
  'јули',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
];
const NAME_COLUMN = 1; // B
const FIRST_MONTH_COLUMN = 2; // C
const TOTAL_LABEL = 'вкупно';
const INCOME_TITLE = 'приходи';
const EXPENSE_TITLE = 'расходи';

type Line = BudgetImportPreviewResponse['income'][number];
export type ParsedBudget = Pick<
  BudgetImportPreviewResponse,
  | 'income'
  | 'expenses'
  | 'incomeTotalMkd'
  | 'expensesTotalMkd'
  | 'monthlyIncomeMkd'
  | 'monthlyExpensesMkd'
  | 'warnings'
  | 'anomalies'
>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const key = (value: unknown): string => text(value).toLowerCase();

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/** A cell that shows an error such as #REF!; `readBudgetSheet` hands these over as `{ error }`. */
function errorOf(value: unknown): string | null {
  if (value && typeof value === 'object' && 'error' in value) {
    return String((value as { error: unknown }).error);
  }
  return null;
}

const isMonthHeader = (row: readonly unknown[]): boolean =>
  key(row[FIRST_MONTH_COLUMN]) === MONTH_NAMES[0];

const monthKey = (year: number, index: number) => `${year}-${String(index + 1).padStart(2, '0')}`;

/**
 * Reads the Буџет sheet: a title row ("Приходи" or "Расходи"), then blocks that each start with a
 * header row naming the months (Јануари … Декември) in columns C–N, followed by lines and a
 * "Вкупно" row. Column O (the yearly total) is ignored: it is worked out from the lines instead.
 * Empty cells stay empty, they are not zeros. A "Вкупно" that disagrees with its lines becomes a
 * warning rather than a silent correction.
 */
export function parseBudgetGrid(grid: Grid, year: number): ParsedBudget {
  const income: Line[] = [];
  const expenses: Line[] = [];
  const warnings: string[] = [];
  const anomalies: ParsedBudget['anomalies'] = [];
  const usedKeys = new Set<string>();
  let side: 'income' | 'expenses' = 'income';
  let section = '';
  let block: Line[] = [];

  const checkTotals = (row: readonly unknown[]) => {
    for (let m = 0; m < 12; m++) {
      const stated = whole(row[FIRST_MONTH_COLUMN + m]);
      if (stated === null) continue;
      const mk = monthKey(year, m);
      const summed = block.reduce((sum, line) => sum + (line.amountsMkd[mk] ?? 0), 0);
      if (summed !== stated) {
        warnings.push(
          `${section}, ${mk}: the sheet's total is ${stated} but its lines add up to ${summed}`,
        );
      }
    }
  };

  for (const row of grid) {
    const label = text(row[NAME_COLUMN]);
    if (isMonthHeader(row)) {
      section = side === 'income' && !label ? 'Приходи' : label;
      block = [];
      continue;
    }
    if (key(label) === INCOME_TITLE) side = 'income';
    else if (key(label) === EXPENSE_TITLE) side = 'expenses';
    else if (key(label) === TOTAL_LABEL) {
      if (section) checkTotals(row);
    } else if (label && section) {
      const amountsMkd: Record<string, number> = {};
      const problems: ParsedBudget['anomalies'] = [];
      const lineSection = side === 'income' ? 'Приходи' : section;
      for (let m = 0; m < 12; m++) {
        const mk = monthKey(year, m);
        const cell = row[FIRST_MONTH_COLUMN + m];
        const error = errorOf(cell);
        const amount = whole(cell);
        if (error) {
          problems.push({
            kind: 'error_cell',
            lineKey: '',
            section: lineSection,
            name: label,
            month: mk,
            message: `The cell shows ${error}`,
          });
        } else if (amount !== null && amount < 0) {
          problems.push({
            kind: 'negative',
            lineKey: '',
            section: lineSection,
            name: label,
            month: mk,
            message: `The amount is negative (${amount})`,
          });
        } else if (amount !== null && amount !== 0) amountsMkd[mk] = amount;
      }
      const months = Object.keys(amountsMkd);
      if (months.length === 0 && problems.length === 0) continue; // a label with nothing entered (e.g. a car's name)
      // A month left empty between two filled ones of an expense line may be a forgotten entry.
      if (side === 'expenses' && months.length >= 2) {
        const flagged = new Set(problems.map((p) => p.month));
        const first = months[0]!;
        const last = months[months.length - 1]!;
        for (let m = 0; m < 12; m++) {
          const mk = monthKey(year, m);
          if (mk > first && mk < last && !(mk in amountsMkd) && !flagged.has(mk)) {
            problems.push({
              kind: 'gap',
              lineKey: '',
              section: lineSection,
              name: label,
              month: mk,
              message: 'Empty between months that have an amount',
            });
          }
        }
      }
      let lineKey = `${lineSection}|${label}`;
      for (let n = 2; usedKeys.has(lineKey); n++) lineKey = `${lineSection}|${label}#${n}`;
      usedKeys.add(lineKey);
      for (const problem of problems) anomalies.push({ ...problem, lineKey });
      const line: Line = {
        key: lineKey,
        section: lineSection,
        name: label,
        amountsMkd,
        totalMkd: Object.values(amountsMkd).reduce((a, b) => a + b, 0),
        suggestedCategoryId: null,
        suggestedCategoryName: null,
      };
      block.push(line);
      (side === 'income' ? income : expenses).push(line);
    }
  }

  const monthly = (lines: Line[]) => {
    const totals: Record<string, number> = {};
    for (const line of lines) {
      for (const [month, amount] of Object.entries(line.amountsMkd)) {
        totals[month] = (totals[month] ?? 0) + amount;
      }
    }
    return totals;
  };
  const sum = (lines: Line[]) => lines.reduce((total, line) => total + line.totalMkd, 0);

  return {
    income,
    expenses,
    incomeTotalMkd: sum(income),
    expensesTotalMkd: sum(expenses),
    monthlyIncomeMkd: monthly(income),
    monthlyExpensesMkd: monthly(expenses),
    warnings,
    anomalies: anomalies.sort(
      (a, b) => a.lineKey.localeCompare(b.lineKey) || a.month.localeCompare(b.month),
    ),
  };
}
