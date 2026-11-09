import type { HistoryMonthResponse } from '@nestmint/shared';
import { formatMonth } from '../spending/months';
import type { Currency } from '../home/currency';
import { formatAmount } from '../home/kpi';
import { trend } from './geometry';
import { MonthLabels } from './MonthLabels';

const WIDTH = 360;
const PLOT_HEIGHT = 110;

interface Props {
  months: readonly HistoryMonthResponse[];
  currency: Currency;
  /** The last month shown, "YYYY-MM"; euro amounts use that month's rate. */
  month: string;
}

/** What was left each month (bars: green gained, red lost) and the running total of it (line). */
export function SavingsTrend({ months, currency, month }: Props) {
  const shape = trend(
    months.map((m) => m.netMkd),
    months.map((m) => m.cumulativeNetMkd),
    { width: WIDTH, height: PLOT_HEIGHT, pad: 6 },
  );
  const slot = WIDTH / Math.max(1, months.length);
  const centers = months.map((_, i) => slot * i + slot / 2);
  const total = months.at(-1)?.cumulativeNetMkd ?? 0;

  return (
    <div>
      <p className="mb-1 text-sm">
        Running total: <strong>{formatAmount(total, currency, month)}</strong>
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${PLOT_HEIGHT + 18}`}
        role="img"
        aria-label={`Monthly net and running total for the ${months.length} months up to ${formatMonth(month)}; the figures are in the table below`}
        className="w-full"
      >
        <line
          x1="0"
          x2={WIDTH}
          y1={shape.zeroY}
          y2={shape.zeroY}
          stroke="#9ca3af"
          strokeWidth="1"
        />
        {shape.bars.map((bar, i) => (
          <rect
            key={months[i]!.month}
            {...bar}
            fill={months[i]!.netMkd >= 0 ? '#047857' : '#dc2626'}
          />
        ))}
        <polyline points={shape.line} fill="none" stroke="#1f2937" strokeWidth="2" />
        <MonthLabels months={months.map((m) => m.month)} centers={centers} y={PLOT_HEIGHT + 13} />
      </svg>
      <p className="mt-1 flex gap-4 text-xs text-gray-600">
        <span>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 bg-emerald-700" />
          Net gained
        </span>
        <span>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 bg-red-600" />
          Net lost
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1 inline-block h-0.5 w-3 bg-gray-800 align-middle"
          />
          Running total
        </span>
      </p>
      <table className="sr-only">
        <caption>Net and running total by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Net</th>
            <th>Running total</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{formatMonth(m.month)}</td>
              <td>{formatAmount(m.netMkd, currency, month)}</td>
              <td>{formatAmount(m.cumulativeNetMkd, currency, month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
