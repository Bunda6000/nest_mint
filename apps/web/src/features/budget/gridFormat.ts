import { convertMkdToEur } from '@nestmint/finance-engine';
import type { BudgetCellResponse } from '@nestmint/shared';
import { lastDayOfMonth } from '../spending/months';
import type { Currency } from '../home/currency';

const MINUS = '−';
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * An amount for a grid cell: whole numbers without a unit (the toggle above the grid says which),
 * "–" for nothing. Euro at the rate on the month's last day, like everywhere else (ADR-008).
 */
export function gridAmount(mkd: number, currency: Currency, month: string): string {
  if (mkd === 0) return '–';
  const value =
    currency === 'MKD'
      ? mkd
      : Math.round(convertMkdToEur(mkd, lastDayOfMonth(month)).eurCents / 100);
  const text = whole.format(Math.abs(value));
  return value < 0 ? `${MINUS}${text}` : text;
}

/** Spent more than planned. A group without a plan is never over it. */
export function isOverPlan(cell: BudgetCellResponse): boolean {
  return cell.plannedMkd !== null && cell.actualMkd > cell.plannedMkd;
}
