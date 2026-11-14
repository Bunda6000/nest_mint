import type { Money } from './money.js';

/** What the score looks at. Each key is one factor (NM-51). */
export type HealthFactorKey =
  'savings_rate' | 'spending_ratio' | 'goal_progress' | 'consistency' | 'emergency_fund';

export interface HealthMonth {
  income: Money;
  expenses: Money;
}

export interface HealthInput {
  /** Recent complete months that had income, at most six, any order. */
  months: readonly HealthMonth[];
  /** Everything saved in goals right now. */
  savedMkd: Money;
  /** The `status` of every active goal. */
  goalStatuses: readonly string[];
}

export interface HealthFactor {
  key: HealthFactorKey;
  /** 0 to 100. */
  score: number;
  /** Share of the total score, in percent, after leaving out factors with no data. */
  weight: number;
  /** The calculation behind the score, in words and numbers (denars are shown as plain integers). */
  detail: string;
  /** What would raise it. */
  tip: string;
}

export interface HealthScore {
  /** 0 to 100; null when there is no month with income to judge. */
  score: number | null;
  label: 'excellent' | 'good' | 'fair' | 'needs_attention' | null;
  factors: HealthFactor[];
  /** The factors that cost the most points, worst first (at most two). */
  improvements: HealthFactor[];
}

const BASE_WEIGHT: Record<HealthFactorKey, number> = {
  savings_rate: 30,
  spending_ratio: 20,
  emergency_fund: 20,
  goal_progress: 15,
  consistency: 15,
};

/** Savings of 20 % of income or more is full marks. */
export const TARGET_SAVINGS_RATE = 0.2;
/** Spending up to 80 % of income is full marks; 100 % or more is zero. */
export const COMFORTABLE_SPENDING_RATIO = 0.8;
/** Three months of expenses saved is full marks. */
export const TARGET_EMERGENCY_MONTHS = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const GOAL_STATUS_VALUE: Record<string, number> = {
  done: 1,
  on_track: 1,
  ongoing: 1,
  behind: 0.4,
  no_pace: 0.2,
  overdue: 0,
};

type Raw = Omit<HealthFactor, 'weight'>;

export function healthScore(input: HealthInput): HealthScore {
  const months = input.months.filter((m) => m.income > 0);
  if (months.length === 0) return { score: null, label: null, factors: [], improvements: [] };

  const income = months.reduce((t, m) => t + m.income, 0);
  const expenses = months.reduce((t, m) => t + m.expenses, 0);
  const rate = (income - expenses) / income;
  const ratio = expenses / income;
  const raw: Raw[] = [];

  raw.push({
    key: 'savings_rate',
    score: Math.round(clamp01(rate / TARGET_SAVINGS_RATE) * 100),
    detail: `You kept ${pct(Math.max(rate, 0))} of your income (income ${income}, spent ${expenses} over ${months.length} month${months.length === 1 ? '' : 's'}). ${pct(TARGET_SAVINGS_RATE)} or more is full marks.`,
    tip: 'Move money to savings on payday, before spending, until you keep 20% of income.',
  });

  raw.push({
    key: 'spending_ratio',
    score: Math.round(clamp01((1 - ratio) / (1 - COMFORTABLE_SPENDING_RATIO)) * 100),
    detail: `You spent ${pct(ratio)} of your income. Up to ${pct(COMFORTABLE_SPENDING_RATIO)} is full marks; 100% or more is zero.`,
    tip: 'Look at your three biggest categories for a cut that does not hurt.',
  });

  if (months.length >= 3) {
    const good = months.filter((m) => m.income - m.expenses >= 0).length;
    raw.push({
      key: 'consistency',
      score: Math.round((good / months.length) * 100),
      detail: `${good} of the last ${months.length} months ended with money left over.`,
      tip: 'Fix the months that overspend, usually one-off costs; plan them in the budget.',
    });
  }

  if (input.goalStatuses.length > 0) {
    const values = input.goalStatuses.map((s) => GOAL_STATUS_VALUE[s] ?? 0);
    const mean = values.reduce((t, v) => t + v, 0) / values.length;
    raw.push({
      key: 'goal_progress',
      score: Math.round(mean * 100),
      detail: `${values.filter((v) => v === 1).length} of ${values.length} goals are reached, on track or ongoing; late or stalled goals count for less.`,
      tip: 'Open the goals that are behind and add the monthly amount they need.',
    });
  }

  const monthlyExpenses = expenses / months.length;
  if (monthlyExpenses > 0) {
    const covered = input.savedMkd / monthlyExpenses;
    raw.push({
      key: 'emergency_fund',
      score: Math.round(clamp01(covered / TARGET_EMERGENCY_MONTHS) * 100),
      detail: `Your savings cover ${covered.toFixed(1)} months of spending (${input.savedMkd} saved ÷ ${Math.round(monthlyExpenses)} a month). ${TARGET_EMERGENCY_MONTHS} months is full marks.`,
      tip: 'Build an emergency fund goal until it covers three months of spending.',
    });
  }

  const totalWeight = raw.reduce((t, f) => t + BASE_WEIGHT[f.key], 0);
  const factors: HealthFactor[] = raw.map((f) => ({
    ...f,
    weight: Math.round((BASE_WEIGHT[f.key] / totalWeight) * 100),
  }));
  // Rounded shares can add up to 99 or 101; the biggest factor takes the difference.
  const drift = 100 - factors.reduce((t, f) => t + f.weight, 0);
  if (drift !== 0) {
    const biggest = factors.reduce((a, b) => (b.weight > a.weight ? b : a));
    biggest.weight += drift;
  }
  const score = Math.round(raw.reduce((t, f) => t + f.score * BASE_WEIGHT[f.key], 0) / totalWeight);
  const label =
    score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'needs_attention';
  const improvements = [...factors]
    .filter((f) => f.score < 100)
    .sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))
    .slice(0, 2);
  return { score, label, factors, improvements };
}
