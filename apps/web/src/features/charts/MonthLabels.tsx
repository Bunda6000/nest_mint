import { shortMonth } from '../spending/months';
import type { BarPair } from './geometry';

/** The month names under a chart, one for each pair of bars (or each month of a trend). */
export function MonthLabels({
  months,
  centers,
  y,
}: {
  months: readonly string[];
  centers: readonly number[];
  y: number;
}) {
  return (
    <g aria-hidden="true" fontSize="9" fill="currentColor" textAnchor="middle">
      {months.map((month, i) => (
        <text key={month} x={centers[i]} y={y}>
          {shortMonth(month)}
        </text>
      ))}
    </g>
  );
}

export const centersOf = (pairs: readonly BarPair[]) => pairs.map((p) => p.center);
