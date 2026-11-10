import type { BudgetCellResponse, BudgetGridResponse } from '@nestmint/shared';
import { formatRate } from '../../format';
import type { Currency } from '../home/currency';
import { shortMonth } from '../spending/months';
import { gridAmount, isOverPlan } from './gridFormat';

interface GridTableProps {
  grid: BudgetGridResponse;
  currency: Currency;
}

const head = 'px-2 py-2 text-right text-xs font-medium text-gray-500';
const num = 'px-2 py-1.5 text-right tabular-nums';
const label = 'sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-medium';
const yearColumn = 'border-l border-gray-200 font-medium';

/** A group's month: what was spent, and underneath what was planned when something was. */
function Spending({
  cell,
  currency,
  month,
}: {
  cell: BudgetCellResponse;
  currency: Currency;
  month: string;
}) {
  const over = isOverPlan(cell);
  return (
    <>
      <span className={over ? 'font-medium text-red-700' : undefined}>
        {gridAmount(cell.actualMkd, currency, month)}
        {over && <span className="sr-only"> (over plan)</span>}
      </span>
      {cell.plannedMkd !== null && (
        <span className="block text-xs text-gray-500">
          plan {gridAmount(cell.plannedMkd, currency, month)}
        </span>
      )}
    </>
  );
}

/** The Буџет sheet: income, a row per group, the expense total, net and savings rate, by month. */
export function GridTable({ grid, currency }: GridTableProps) {
  const yearEnd = grid.months[11]!;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-[56rem] border-collapse text-sm">
        <caption className="sr-only">
          Budget {grid.year}: income, spending by group, net and savings rate for each month
        </caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs">
              <span className="sr-only">Group</span>
            </th>
            {grid.months.map((month) => (
              <th key={month} scope="col" className={head}>
                {shortMonth(month)}
              </th>
            ))}
            <th scope="col" className={`${head} ${yearColumn}`}>
              Year
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="bg-emerald-50/50">
            <th scope="row" className={`${label} bg-emerald-50`}>
              Income
            </th>
            {grid.incomeMkd.map((value, i) => (
              <td key={grid.months[i]} className={num}>
                {gridAmount(value, currency, grid.months[i]!)}
              </td>
            ))}
            <td className={`${num} ${yearColumn}`}>
              {gridAmount(grid.incomeTotalMkd, currency, yearEnd)}
            </td>
          </tr>
          {grid.groups.map((group) => (
            <tr key={group.groupId}>
              <th scope="row" className={label}>
                {group.groupName}
              </th>
              {group.months.map((cell, i) => (
                <td key={grid.months[i]} className={num}>
                  <Spending cell={cell} currency={currency} month={grid.months[i]!} />
                </td>
              ))}
              <td className={`${num} ${yearColumn}`}>
                <Spending cell={group.total} currency={currency} month={yearEnd} />
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 font-medium">
            <th scope="row" className={label}>
              Expenses
            </th>
            {grid.expenses.map((cell, i) => (
              <td key={grid.months[i]} className={num}>
                {gridAmount(cell.actualMkd, currency, grid.months[i]!)}
              </td>
            ))}
            <td className={`${num} ${yearColumn}`}>
              {gridAmount(grid.expensesTotal.actualMkd, currency, yearEnd)}
            </td>
          </tr>
          <tr className="font-medium">
            <th scope="row" className={label}>
              Net
            </th>
            {grid.netMkd.map((value, i) => (
              <td key={grid.months[i]} className={`${num} ${value < 0 ? 'text-red-700' : ''}`}>
                {gridAmount(value, currency, grid.months[i]!)}
              </td>
            ))}
            <td className={`${num} ${yearColumn} ${grid.netTotalMkd < 0 ? 'text-red-700' : ''}`}>
              {gridAmount(grid.netTotalMkd, currency, yearEnd)}
            </td>
          </tr>
          <tr className="text-gray-600">
            <th scope="row" className={label}>
              Savings rate
            </th>
            {grid.savingsRate.map((value, i) => (
              <td key={grid.months[i]} className={num}>
                {formatRate(value)}
              </td>
            ))}
            <td className={`${num} ${yearColumn}`}>{formatRate(grid.savingsRateTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
