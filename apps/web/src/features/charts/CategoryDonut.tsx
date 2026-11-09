import { donutSlices } from '@nestmint/finance-engine';
import type { CategoryTotalResponse } from '@nestmint/shared';
import { formatMonth } from '../spending/months';
import type { Currency } from '../home/currency';
import { formatAmount } from '../home/kpi';
import { formatShare } from './format';
import { donutPaths } from './geometry';

const MAX_SLICES = 6;
const COLORS = ['#047857', '#0284c7', '#d97706', '#7c3aed', '#dc2626', '#0d9488'];
const OTHER_COLOR = '#9ca3af';

interface CategoryDonutProps {
  categories: readonly CategoryTotalResponse[];
  currency: Currency;
  /** The month shown, "YYYY-MM". */
  month: string;
}

/** Where the month's money went, by category group; the smallest groups are merged into "Other". */
export function CategoryDonut({ categories, currency, month }: CategoryDonutProps) {
  const slices = donutSlices(
    categories.map((c) => ({ key: c.groupId, label: c.groupName, amount: c.amountMkd })),
    MAX_SLICES,
  );
  if (slices.length === 0) {
    return <p className="text-sm text-gray-500">No spending in {formatMonth(month)}.</p>;
  }
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const paths = donutPaths(
    slices.map((s) => s.share),
    { cx: 50, cy: 50, outer: 46, inner: 30 },
  );
  const colorOf = (key: string, index: number) =>
    key === 'other' ? OTHER_COLOR : COLORS[index % COLORS.length];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Spending by group in ${formatMonth(month)}: ${slices
          .map((s) => `${s.label} ${formatShare(s.share)}`)
          .join(', ')}`}
        className="w-40"
      >
        {paths.map((d, i) => (
          <path key={slices[i]!.key} d={d} fillRule="evenodd" fill={colorOf(slices[i]!.key, i)} />
        ))}
        <text x="50" y="52" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor">
          {formatAmount(total, currency, month)}
        </text>
      </svg>
      <ul className="w-full space-y-1 text-sm">
        {slices.map((slice, i) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: colorOf(slice.key, i) }}
            />
            <span className="flex-1">{slice.label}</span>
            <span>{formatAmount(slice.amount, currency, month)}</span>
            <span className="w-10 text-right text-gray-500">{formatShare(slice.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
