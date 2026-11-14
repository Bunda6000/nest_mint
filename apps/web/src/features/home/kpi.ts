import type { AmountChange } from '@nestmint/finance-engine';
import { convertMkdToEur } from '../../rates';
import { formatEurCents, formatMkd } from '../../format';
import { currentLocale } from '../../i18n/language';
import { lastDayOfMonth } from '../spending/months';
import type { Currency } from './currency';

export type Tone = 'good' | 'bad' | 'neutral';

/** What a change looks like on a card. */
export interface ChangeView {
  text: string;
  tone: Tone;
  direction: 'up' | 'down' | 'none';
}

const MINUS = '−';

/** An amount in whole denars, shown in the chosen currency; euro at the rate on the month's last day. */
export function formatAmount(mkd: number, currency: Currency, month: string): string {
  if (currency === 'MKD') return formatMkd(mkd);
  return formatEurCents(convertMkdToEur(mkd, lastDayOfMonth(month)).eurCents);
}

function formatSigned(mkd: number, currency: Currency, month: string): string {
  const sign = mkd > 0 ? '+' : MINUS;
  return `${sign}${formatAmount(Math.abs(mkd), currency, month)}`;
}

const percent = () =>
  new Intl.NumberFormat(currentLocale(), { style: 'percent', maximumFractionDigits: 1 });

/** 0.08 → "+8%", −0.177 → "−17.7%", a rounded 0 → "0%". */
export function formatRatio(ratio: number): string {
  const text = percent().format(Math.abs(ratio));
  if (text === '0%') return text;
  return `${ratio > 0 ? '+' : MINUS}${text}`;
}

/** Income and net doing better is good; spending more is bad; no change is neither. */
function toneOf(kpi: 'income' | 'expenses' | 'net', direction: 'up' | 'down' | 'none'): Tone {
  if (direction === 'none') return 'neutral';
  const goingUpIsGood = kpi !== 'expenses';
  return (direction === 'up') === goingUpIsGood ? 'good' : 'bad';
}

/** The change line of the income, expenses or net card. */
export function amountChangeView(
  kpi: 'income' | 'expenses' | 'net',
  change: AmountChange,
  currency: Currency,
  month: string,
): ChangeView {
  if (change.amount === 0) return { text: 'No change', tone: 'neutral', direction: 'none' };
  const direction = change.amount > 0 ? 'up' : 'down';
  const amount = formatSigned(change.amount, currency, month);
  const text = change.ratio === null ? amount : `${amount} (${formatRatio(change.ratio)})`;
  return { text, tone: toneOf(kpi, direction), direction };
}

/** The change line of the savings rate card, in percentage points; "—" when there is no rate to compare. */
export function rateChangeView(change: number | null): ChangeView {
  if (change === null) return { text: '—', tone: 'neutral', direction: 'none' };
  const points = Math.abs(change * 100).toFixed(1);
  if (points === '0.0') return { text: 'No change', tone: 'neutral', direction: 'none' };
  const direction = change > 0 ? 'up' : 'down';
  return {
    text: `${change > 0 ? '+' : MINUS}${points} pts`,
    tone: direction === 'up' ? 'good' : 'bad',
    direction,
  };
}
