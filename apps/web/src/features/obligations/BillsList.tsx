import { convertMkdToEur } from '@nestmint/finance-engine';
import type { BillResponse } from '@nestmint/shared';
import { formatEurCents, formatMkd } from '../../format';
import { formatMonth } from '../spending/months';
import { formatDueDate } from './obligationText';

/** The month's bills, soonest due first. Read-only for now: paying a bill comes next. */
export function BillsList({ bills, month }: { bills: BillResponse[]; month: string }) {
  const total = bills.reduce((sum, bill) => sum + bill.expectedAmountMkd, 0);
  return (
    <section aria-labelledby="bills-heading" className="mt-8">
      <h2 id="bills-heading" className="text-lg font-semibold">
        Bills in {formatMonth(month)}
      </h2>
      {bills.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No bills due this month.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col divide-y rounded-lg border">
            {bills.map((bill) => (
              <li key={bill.id} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{bill.obligationName}</p>
                  <p className="text-xs text-gray-500">
                    Due {formatDueDate(bill)}
                    {bill.payee ? ` · ${bill.payee}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium">{formatMkd(bill.expectedAmountMkd)}</p>
                  <p className="text-xs text-gray-500">
                    {formatEurCents(convertMkdToEur(bill.expectedAmountMkd, bill.dueDate).eurCents)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-sm text-gray-600">
            Expected in total: <span className="font-medium">{formatMkd(total)}</span>
          </p>
        </>
      )}
    </section>
  );
}
