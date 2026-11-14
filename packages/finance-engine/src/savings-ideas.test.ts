import { describe, expect, it } from 'vitest';
import { savingsIdeas, type CategorySpend } from './savings-ideas.js';

const row = (categoryId: string, categoryName: string, amountMkd: number): CategorySpend => ({
  categoryId,
  categoryName,
  amountMkd,
});

describe('savingsIdeas', () => {
  it('has nothing to say without history', () => {
    expect(savingsIdeas([], {})).toEqual([]);
  });

  it('suggests a 15 % trim on a discretionary category, with the calculation', () => {
    const months = ['2026-09', '2026-10'];
    const byMonth = {
      '2026-09': [row('r', 'Restaurants', 10_000), row('g', 'Groceries', 20_000)],
      '2026-10': [row('r', 'Restaurants', 10_000), row('g', 'Groceries', 20_000)],
    };
    const ideas = savingsIdeas(months, byMonth);
    const trim = ideas.find((i) => i.kind === 'trim')!;
    expect(trim).toMatchObject({
      categoryName: 'Restaurants',
      monthlyImpactMkd: 1_500,
      yearlyImpactMkd: 18_000,
    });
    expect(trim.method).toBe('15% of 10,000 = 1,500 a month; × 12 = 18,000 a year.');
    // Groceries is not discretionary, but is the biggest cost, so it is named for context.
    expect(ideas.find((i) => i.kind === 'top')?.categoryName).toBe('Groceries');
  });

  it('does not trim small or non-discretionary categories', () => {
    const ideas = savingsIdeas(['2026-10'], {
      '2026-10': [row('r', 'Restaurants', 2_000), row('rent', 'Rent', 30_000)],
    });
    expect(ideas.some((i) => i.kind === 'trim')).toBe(false);
  });

  it('flags a rising category against its earlier months', () => {
    const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    const byMonth = Object.fromEntries(
      months.map((m, i) => [m, [row('f', 'Fuel', i < 3 ? 5_000 : 8_000)]]),
    );
    const rising = savingsIdeas(months, byMonth).find((i) => i.kind === 'rising')!;
    expect(rising).toMatchObject({ monthlyImpactMkd: 3_000, yearlyImpactMkd: 36_000 });
    expect(rising.why).toContain('+60%');
  });

  it('flags an unusually high last month as information only', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    const byMonth = {
      '2026-08': [row('h', 'Healthcare', 2_000)],
      '2026-09': [row('h', 'Healthcare', 2_000)],
      '2026-10': [row('h', 'Healthcare', 9_000)],
    };
    const unusual = savingsIdeas(months, byMonth).find((i) => i.kind === 'unusual')!;
    expect(unusual.monthlyImpactMkd).toBe(0);
    expect(unusual.method).toContain('9,000 − 2,000 = 7,000 above usual');
  });

  it('orders by yearly impact and returns at most six', () => {
    const names = ['Restaurants', 'Entertainment', 'Shopping', 'Subscriptions', 'Travel'];
    const month = names.map((n, i) => row(`c${i}`, n, 10_000 + i * 10_000));
    const ideas = savingsIdeas(['2026-10'], { '2026-10': month });
    expect(ideas.length).toBeLessThanOrEqual(6);
    const impacts = ideas.map((i) => i.yearlyImpactMkd);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(ideas[0]!.categoryName).toBe('Travel');
  });
});
