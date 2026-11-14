import type { Money } from './money.js';

export type IdeaKind = 'trim' | 'rising' | 'unusual' | 'top';

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  amountMkd: Money;
}

export interface SavingsIdea {
  /** Stable per kind and category, so the screen can key on it. */
  id: string;
  kind: IdeaKind;
  categoryId: string;
  categoryName: string;
  /** What was noticed and what to do. */
  title: string;
  /** Why it was raised, with the numbers. */
  why: string;
  /** How the saving was worked out. */
  method: string;
  /** What it would save per month if followed; 0 for information only. */
  monthlyImpactMkd: Money;
  yearlyImpactMkd: Money;
}

/** Categories where a small cut costs little comfort. Matched by the default names. */
export const DISCRETIONARY = [
  'Restaurants',
  'Entertainment',
  'Shopping',
  'Subscriptions',
  'Travel',
];
/** A cut of this share of the usual monthly spending is suggested for them. */
export const TRIM_SHARE = 0.15;
/** Spending in a category must be at least this much per month to be worth a suggestion. */
export const MIN_TRIM_BASE_MKD = 3_000;
/** A category is "rising" when it is this much above its earlier level… */
export const RISING_FACTOR = 1.2;
/** …and the rise is at least this much per month. */
export const MIN_RISE_MKD = 1_000;
/** A month is "unusual" for a category when it is this many times its usual… */
export const UNUSUAL_FACTOR = 1.5;
/** …and the excess is at least this much. */
export const MIN_EXCESS_MKD = 2_000;
export const MAX_IDEAS = 6;
const RECENT = 3;

const money = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
const avg = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((t, v) => t + v, 0) / values.length;

/**
 * Plain, explainable rules over past spending (NM-70). `months` are complete months, oldest first;
 * `byMonth[month]` is what was spent per category in it. Every idea carries the numbers it used.
 */
export function savingsIdeas(
  months: readonly string[],
  byMonth: Readonly<Record<string, readonly CategorySpend[]>>,
): SavingsIdea[] {
  if (months.length === 0) return [];
  const recentMonths = months.slice(-RECENT);
  const earlierMonths = months.slice(0, -RECENT);
  const latest = months.at(-1)!;
  const before = months.slice(0, -1);

  const names = new Map<string, string>();
  const perCategory = new Map<string, Map<string, number>>();
  for (const month of months) {
    for (const row of byMonth[month] ?? []) {
      names.set(row.categoryId, row.categoryName);
      const m = perCategory.get(row.categoryId) ?? new Map<string, number>();
      m.set(month, (m.get(month) ?? 0) + row.amountMkd);
      perCategory.set(row.categoryId, m);
    }
  }
  const series = (id: string, list: readonly string[]) =>
    list.map((m) => perCategory.get(id)?.get(m) ?? 0);

  const ideas: SavingsIdea[] = [];
  const recentTotal = [...perCategory.keys()].reduce(
    (t, id) => t + avg(series(id, recentMonths)),
    0,
  );

  for (const [id, name] of names) {
    const recentAvg = avg(series(id, recentMonths));
    const base = { categoryId: id, categoryName: name };

    if (DISCRETIONARY.includes(name) && recentAvg >= MIN_TRIM_BASE_MKD) {
      const cut = Math.round(recentAvg * TRIM_SHARE);
      ideas.push({
        ...base,
        id: `trim:${id}`,
        kind: 'trim',
        title: `Spend ${money(cut)} MKD less a month on ${name}`,
        why: `You spend about ${money(recentAvg)} MKD a month on ${name} (average of ${recentMonths.length} month${recentMonths.length === 1 ? '' : 's'}). It is a category where a small cut is easy to live with.`,
        method: `${TRIM_SHARE * 100}% of ${money(recentAvg)} = ${money(cut)} a month; × 12 = ${money(cut * 12)} a year.`,
        monthlyImpactMkd: cut,
        yearlyImpactMkd: cut * 12,
      });
    }

    if (earlierMonths.length > 0) {
      const earlierAvg = avg(series(id, earlierMonths));
      const rise = recentAvg - earlierAvg;
      if (earlierAvg > 0 && recentAvg >= earlierAvg * RISING_FACTOR && rise >= MIN_RISE_MKD) {
        const r = Math.round(rise);
        ideas.push({
          ...base,
          id: `rising:${id}`,
          kind: 'rising',
          title: `${name} is rising: back to the old level saves ${money(r)} MKD a month`,
          why: `${name} went from about ${money(earlierAvg)} MKD a month to ${money(recentAvg)} MKD (+${Math.round((rise / earlierAvg) * 100)}%).`,
          method: `${money(recentAvg)} − ${money(earlierAvg)} = ${money(r)} a month; × 12 = ${money(r * 12)} a year.`,
          monthlyImpactMkd: r,
          yearlyImpactMkd: r * 12,
        });
      }
    }

    if (before.length > 0) {
      const usual = avg(series(id, before));
      const last = perCategory.get(id)?.get(latest) ?? 0;
      const excess = last - usual;
      if (usual > 0 && last >= usual * UNUSUAL_FACTOR && excess >= MIN_EXCESS_MKD) {
        ideas.push({
          ...base,
          id: `unusual:${id}`,
          kind: 'unusual',
          title: `${name} was unusually high last month`,
          why: `Last month you spent ${money(last)} MKD on ${name}, against a usual ${money(usual)} MKD.`,
          method: `${money(last)} − ${money(usual)} = ${money(excess)} above usual. If it was a one-off, nothing to do; if it repeats, it is the saving to chase.`,
          monthlyImpactMkd: 0,
          yearlyImpactMkd: 0,
        });
      }
    }
  }

  // The biggest category, for context, only when nothing above already covers it.
  const top = [...names.keys()]
    .map((id) => ({ id, amount: avg(series(id, recentMonths)) }))
    .sort((a, b) => b.amount - a.amount)[0];
  if (top && top.amount > 0 && recentTotal > 0 && !ideas.some((i) => i.categoryId === top.id)) {
    const name = names.get(top.id)!;
    ideas.push({
      id: `top:${top.id}`,
      kind: 'top',
      categoryId: top.id,
      categoryName: name,
      title: `${name} is your biggest cost`,
      why: `${money(top.amount)} MKD a month is ${Math.round((top.amount / recentTotal) * 100)}% of your spending.`,
      method: `${money(top.amount)} ÷ ${money(recentTotal)} = ${Math.round((top.amount / recentTotal) * 100)}%. A 10% cut here would save ${money(top.amount * 0.1)} MKD a month.`,
      monthlyImpactMkd: 0,
      yearlyImpactMkd: 0,
    });
  }

  return ideas
    .sort((a, b) => b.yearlyImpactMkd - a.yearlyImpactMkd || a.id.localeCompare(b.id))
    .slice(0, MAX_IDEAS);
}
