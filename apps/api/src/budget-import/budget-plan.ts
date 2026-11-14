import type { BudgetImportDecisions, BudgetImportPreviewResponse } from '@nestmint/shared';
import { addMonths } from '@nestmint/finance-engine';
import type { NewIncome } from '../income/income.repository.js';
import type { NewTransaction } from '../transactions/transactions.repository.js';

type Parsed = Pick<BudgetImportPreviewResponse, 'income' | 'expenses' | 'anomalies'>;

export interface ImportPlan {
  income: NewIncome[];
  expenses: NewTransaction[];
  /** What the saved rows add up to over the year (a salary counts once per month it covers). */
  incomeTotalMkd: number;
  expensesTotalMkd: number;
  /** Field → message, for a 400 answer. Empty when the plan can be saved. */
  problems: Record<string, string>;
}

/** The pay day given to imported salaries: the sheet only knows the month. */
export const IMPORTED_PAY_DAY = 1;

function previousMonth(month: string): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

/** A run of the same amount in consecutive months, which is how a salary looks in the sheet. */
function monthlyRun(amounts: Record<string, number>): { start: string; end: string } | null {
  const months = Object.keys(amounts).sort();
  if (months.length < 2) return null;
  const first = amounts[months[0]!]!;
  for (let i = 0; i < months.length; i++) {
    if (amounts[months[i]!] !== first) return null;
    if (i > 0 && addMonths(months[i - 1]!, 1) !== months[i]) return null;
  }
  return { start: months[0]!, end: months[months.length - 1]! };
}

/**
 * Turns the parsed sheet and the user's decisions into what will be saved, or says what is wrong.
 * Income lines that repeat the same amount every month in a row become one monthly salary (still
 * running when it reaches the latest month); anything else becomes a one-off per month. Expense
 * lines become one expense per month, dated the 1st, with the sheet's line as the note.
 */
export function buildPlan(
  parsed: Parsed,
  decisions: BudgetImportDecisions,
  currentMonth: string,
  usableCategory: (id: string) => boolean,
): ImportPlan {
  const problems: Record<string, string> = {};
  const fixes = new Map(decisions.fixes.map((f) => [`${f.lineKey}@${f.month}`, f.amountMkd]));
  const open = parsed.anomalies.filter((a) => !fixes.has(`${a.lineKey}@${a.month}`));
  if (open.length > 0) {
    problems.anomalies = `${open.length} item(s) still need to be confirmed or fixed`;
  }

  const amountsOf = (line: Parsed['income'][number]): Record<string, number> => {
    const amounts = { ...line.amountsMkd };
    for (const anomaly of parsed.anomalies) {
      if (anomaly.lineKey !== line.key) continue;
      const fixed = fixes.get(`${line.key}@${anomaly.month}`);
      if (fixed) amounts[anomaly.month] = fixed;
    }
    return amounts;
  };

  const income: NewIncome[] = [];
  let incomeTotalMkd = 0;
  const expenses: NewTransaction[] = [];
  const unknownKeys = Object.keys(decisions.lines).filter(
    (key) => ![...parsed.income, ...parsed.expenses].some((line) => line.key === key),
  );
  if (unknownKeys.length > 0) problems.lines = `Unknown line: ${unknownKeys[0]}`;

  for (const line of parsed.income) {
    if (decisions.lines[line.key]?.skip) continue;
    const amounts = amountsOf(line);
    const months = Object.keys(amounts).sort();
    if (months.some((m) => m > currentMonth)) {
      problems[line.key] = 'Has amounts in a month that has not started';
      continue;
    }
    incomeTotalMkd += months.reduce((sum, m) => sum + amounts[m]!, 0);
    const run = monthlyRun(amounts);
    if (run) {
      const stillRunning = run.end >= previousMonth(currentMonth);
      income.push({
        name: line.name,
        amountMkd: amounts[run.start]!,
        recurrence: 'monthly',
        receivedOn: null,
        startMonth: run.start,
        endMonth: stillRunning ? null : run.end,
        payDay: IMPORTED_PAY_DAY,
      });
    } else {
      for (const month of months) {
        income.push({
          name: line.name,
          amountMkd: amounts[month]!,
          recurrence: 'one_off',
          receivedOn: `${month}-01`,
          startMonth: null,
          endMonth: null,
          payDay: null,
        });
      }
    }
  }

  for (const line of parsed.expenses) {
    const decision = decisions.lines[line.key];
    if (decision?.skip) continue;
    if (!decision?.categoryId) {
      problems[line.key] = 'Choose a category or skip this line';
      continue;
    }
    if (!usableCategory(decision.categoryId)) {
      problems[line.key] = 'That category cannot be used';
      continue;
    }
    const amounts = amountsOf(line);
    for (const month of Object.keys(amounts).sort()) {
      if (month > currentMonth) {
        problems[line.key] = 'Has amounts in a month that has not started';
        break;
      }
      expenses.push({
        kind: 'expense',
        categoryId: decision.categoryId,
        amountMkd: amounts[month]!,
        occurredOn: `${month}-01`,
        note: `Import Budget.xlsx: ${line.section} / ${line.name}`,
      });
    }
  }
  const expensesTotalMkd = expenses.reduce((sum, e) => sum + e.amountMkd, 0);
  return { income, expenses, incomeTotalMkd, expensesTotalMkd, problems };
}
