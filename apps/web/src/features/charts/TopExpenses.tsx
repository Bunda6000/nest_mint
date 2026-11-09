import type { TransactionResponse } from '@nestmint/shared';
import { formatMonth } from '../spending/months';
import type { Currency } from '../home/currency';
import { formatAmount } from '../home/kpi';
import { formatDay } from './format';

interface Props {
  transactions: readonly TransactionResponse[];
  currency: Currency;
  /** The month shown, "YYYY-MM". */
  month: string;
}

/** The biggest single transactions of the month. */
export function TopExpenses({ transactions, currency, month }: Props) {
  if (transactions.length === 0) {
    return <p className="text-sm text-gray-500">No spending in {formatMonth(month)}.</p>;
  }
  return (
    <ol className="space-y-2">
      {transactions.map((t, i) => (
        <li key={t.id} className="flex items-baseline gap-3 text-sm">
          <span aria-hidden="true" className="w-4 text-gray-400">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{t.note || t.categoryName}</span>
            <span className="block text-xs text-gray-500">
              {t.note ? `${t.categoryName} · ` : ''}
              {formatDay(t.occurredOn)}
              {t.kind === 'cash_withdrawal' ? ' · Cash withdrawal' : ''}
            </span>
          </span>
          <span className="font-medium">{formatAmount(t.amountMkd, currency, month)}</span>
        </li>
      ))}
    </ol>
  );
}
