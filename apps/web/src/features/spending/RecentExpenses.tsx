import { convertMkdToEur } from '@nestmint/finance-engine';
import type { TransactionResponse } from '@nestmint/shared';
import { formatDay, formatEurCents, formatMkd } from '../../format';

interface RecentExpensesProps {
  expenses: TransactionResponse[];
}

/** The latest expenses, newest first. The full, editable list is a later story. */
export function RecentExpenses({ expenses }: RecentExpensesProps) {
  if (expenses.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">No expenses yet.</p>;
  }
  return (
    <ul className="mt-3 flex flex-col divide-y rounded-lg border">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex items-start justify-between gap-4 p-3">
          <div className="min-w-0">
            <p className="font-medium">{expense.categoryName}</p>
            {expense.note && <p className="truncate text-sm text-gray-600">{expense.note}</p>}
            <p className="text-xs text-gray-500">{formatDay(expense.occurredOn)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-medium">{formatMkd(expense.amountMkd)}</p>
            <p className="text-xs text-gray-500">
              {formatEurCents(convertMkdToEur(expense.amountMkd, expense.occurredOn).eurCents)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
