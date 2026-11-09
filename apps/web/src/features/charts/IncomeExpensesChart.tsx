import type { HistoryMonthResponse } from '@nestmint/shared';
import { formatMonth } from '../spending/months';
import type { Currency } from '../home/currency';
import { formatAmount } from '../home/kpi';
import { groupedBars } from './geometry';
import { centersOf, MonthLabels } from './MonthLabels';

const WIDTH = 360;
const BARS_HEIGHT = 110;

interface Props {
  months: readonly HistoryMonthResponse[];
  currency: Currency;
  /** The last month shown, "YYYY-MM"; euro amounts use that month's rate. */
  month: string;
}

/** Income and expenses side by side for each of the last months. */
export function IncomeExpensesChart({ months, currency, month }: Props) {
  const bars = groupedBars(
    months.map((m) => [m.incomeMkd, m.expensesMkd] as const),
    { width: WIDTH, height: BARS_HEIGHT },
  );
  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${BARS_HEIGHT + 18}`}
        role="img"
        aria-label={`Income and expenses for the ${months.length} months up to ${formatMonth(month)}; the figures are in the table below`}
        className="w-full"
      >
        {bars.map((pair, i) => (
          <g key={months[i]!.month}>
            <rect {...pair.a} fill="#047857" />
            <rect {...pair.b} fill="#dc2626" />
          </g>
        ))}
        <MonthLabels
          months={months.map((m) => m.month)}
          centers={centersOf(bars)}
          y={BARS_HEIGHT + 13}
        />
      </svg>
      <p className="mt-1 flex gap-4 text-xs text-gray-600">
        <span>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 bg-emerald-700" />
          Income
        </span>
        <span>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 bg-red-600" />
          Expenses
        </span>
      </p>
      <table className="sr-only">
        <caption>Income and expenses by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Expenses</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{formatMonth(m.month)}</td>
              <td>{formatAmount(m.incomeMkd, currency, month)}</td>
              <td>{formatAmount(m.expensesMkd, currency, month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
