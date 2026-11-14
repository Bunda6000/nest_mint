import { assertMoney, type Money } from './money.js';
import { shiftMonth } from './insights.js';

/**
 * The three ways to save toward something (NM-50):
 * - `target`: an amount, no deadline;
 * - `target_date`: an amount by a month;
 * - `monthly`: a fixed amount to put aside every month, no end.
 */
export type GoalKind = 'target' | 'target_date' | 'monthly';

export interface GoalInput {
  kind: GoalKind;
  /** Whole denars to reach; null for a monthly goal. */
  targetMkd: Money | null;
  /** "YYYY-MM": the last month in which money may still be added; target_date goals only. */
  targetMonth: string | null;
  /** What is planned to be put aside per month; required for monthly goals, optional otherwise. */
  monthlyMkd: Money | null;
  /** Everything put aside so far (contributions minus withdrawals). */
  savedMkd: Money;
  /** What actually went in per month lately (see {@link recentPace}). */
  recentPaceMkd: Money;
  /** "YYYY-MM" of today. */
  currentMonth: string;
}

export type GoalStatus =
  /** The target is reached. */
  | 'done'
  /** The deadline is passed and the target is not reached. */
  | 'overdue'
  /** The pace reaches the target in time (or there is no deadline). */
  | 'on_track'
  /** The pace is too slow for the deadline. */
  | 'behind'
  /** Nothing is being put aside, so no finish can be forecast. */
  | 'no_pace'
  /** A monthly goal: it has no end. */
  | 'ongoing';

export interface GoalProgress {
  savedMkd: Money;
  remainingMkd: Money | null;
  /** 0 to 1, capped at 1; null for a monthly goal. */
  progress: number | null;
  /** Months left including the target month; null without a deadline. */
  monthsLeft: number | null;
  /** The monthly amount that reaches the target on its date; null without a deadline or when done. */
  requiredMonthlyMkd: Money | null;
  /** The monthly pace the forecast uses: the plan if there is one, else the recent pace. */
  paceMkd: Money;
  /** "YYYY-MM" the target is reached at that pace; null when there is no pace or no target. */
  completionMonth: string | null;
  /**
   * How likely the deadline is met, 0 to 100: pace ÷ required monthly, capped. A simple, explainable
   * measure, not a statistical probability. Null without a deadline.
   */
  achievability: number | null;
  status: GoalStatus;
}

/** Whole months from `from` to `to`, both "YYYY-MM"; negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * What goes in per month lately: the sum of the last three complete months ÷ 3. A goal that has
 * only existed for part of that window is divided by the months it has existed (at least 1), so a
 * young goal is not punished for time before it began. Withdrawals count against the pace.
 */
export function recentPace(
  contributions: readonly { month: string; amountMkd: Money }[],
  currentMonth: string,
): Money {
  const window = [1, 2, 3].map((back) => shiftMonth(currentMonth, -back));
  const inWindow = contributions.filter((c) => window.includes(c.month));
  if (inWindow.length === 0) return 0;
  const first = inWindow.map((c) => c.month).sort()[0]!;
  const months = Math.min(3, Math.max(1, monthsBetween(first, currentMonth)));
  const total = inWindow.reduce((sum, c) => sum + c.amountMkd, 0);
  return Math.max(0, Math.round(total / months));
}

export function goalProgress(input: GoalInput): GoalProgress {
  const { kind, targetMkd, targetMonth, monthlyMkd, savedMkd, recentPaceMkd, currentMonth } = input;
  assertMoney(savedMkd, 'savedMkd');
  const paceMkd = monthlyMkd ?? recentPaceMkd;

  if (kind === 'monthly' || targetMkd === null) {
    return {
      savedMkd,
      remainingMkd: null,
      progress: null,
      monthsLeft: null,
      requiredMonthlyMkd: null,
      paceMkd,
      completionMonth: null,
      achievability: null,
      status: 'ongoing',
    };
  }

  const remainingMkd = Math.max(0, targetMkd - savedMkd);
  const progress = targetMkd === 0 ? 1 : Math.min(1, Math.max(0, savedMkd / targetMkd));
  const done = remainingMkd === 0;
  const monthsToFinish = done ? 0 : paceMkd > 0 ? Math.ceil(remainingMkd / paceMkd) : null;
  const completionMonth =
    monthsToFinish === null ? null : shiftMonth(currentMonth, Math.max(0, monthsToFinish - 1));

  if (kind === 'target' || targetMonth === null) {
    return {
      savedMkd,
      remainingMkd,
      progress,
      monthsLeft: null,
      requiredMonthlyMkd: null,
      paceMkd,
      completionMonth,
      achievability: null,
      status: done ? 'done' : paceMkd > 0 ? 'on_track' : 'no_pace',
    };
  }

  const monthsLeft = Math.max(0, monthsBetween(currentMonth, targetMonth) + 1);
  const requiredMonthlyMkd = done
    ? null
    : monthsLeft > 0
      ? Math.ceil(remainingMkd / monthsLeft)
      : remainingMkd;
  const achievability = done
    ? 100
    : monthsLeft === 0
      ? 0
      : Math.min(100, Math.round((paceMkd / requiredMonthlyMkd!) * 100));

  let status: GoalStatus;
  if (done) status = 'done';
  else if (monthsLeft === 0) status = 'overdue';
  else if (paceMkd <= 0) status = 'no_pace';
  else status = paceMkd >= requiredMonthlyMkd! ? 'on_track' : 'behind';

  return {
    savedMkd,
    remainingMkd,
    progress,
    monthsLeft,
    requiredMonthlyMkd,
    paceMkd,
    completionMonth,
    achievability,
    status,
  };
}
