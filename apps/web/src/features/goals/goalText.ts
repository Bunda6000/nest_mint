import type { GoalResponse, GoalStatus } from '@nestmint/shared';
import { currentLocale } from '../../i18n/language';

/** "2027-09" → "Sep 2027". */
export function formatMonthYear(month: string): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  done: 'Reached',
  on_track: 'On track',
  behind: 'Behind',
  overdue: 'Past its date',
  no_pace: 'Not started',
  ongoing: 'Ongoing',
};

export const STATUS_TONE: Record<GoalStatus, string> = {
  done: 'bg-emerald-100 text-emerald-800',
  on_track: 'bg-emerald-100 text-emerald-800',
  behind: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-800',
  no_pace: 'bg-gray-100 text-gray-700',
  ongoing: 'bg-sky-100 text-sky-800',
};

/** The sentence under a goal that says what to do or expect, with the numbers behind it. */
export function goalAdvice(goal: GoalResponse, money: (mkd: number) => string): string {
  switch (goal.status) {
    case 'done':
      return 'You have reached this goal.';
    case 'ongoing':
      return `Planned: ${money(goal.paceMkd)} every month.`;
    case 'overdue':
      return `The date has passed. ${money(goal.remainingMkd ?? 0)} is still missing.`;
    case 'no_pace':
      return goal.requiredMonthlyMkd !== null
        ? `Put aside ${money(goal.requiredMonthlyMkd)} a month to get there on time.`
        : 'Add some money to see when you will get there.';
    case 'behind':
      return `At ${money(goal.paceMkd)} a month you finish in ${formatMonthYear(goal.completionMonth!)}. To meet the date you need ${money(goal.requiredMonthlyMkd!)} a month.`;
    case 'on_track':
      return goal.completionMonth
        ? `At ${money(goal.paceMkd)} a month you reach it in ${formatMonthYear(goal.completionMonth)}.`
        : '';
  }
}
