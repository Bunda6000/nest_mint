import { describe, expect, it } from 'vitest';
import { healthScore } from './health-score.js';

const month = (income: number, expenses: number) => ({ income, expenses });

describe('healthScore', () => {
  it('has no score without a month that had income', () => {
    expect(healthScore({ months: [], savedMkd: 0, goalStatuses: [] }).score).toBeNull();
    expect(
      healthScore({ months: [month(0, 500)], savedMkd: 0, goalStatuses: [] }).score,
    ).toBeNull();
  });

  it('gives full marks for a strong saver', () => {
    const r = healthScore({
      months: [month(100_000, 60_000), month(100_000, 60_000), month(100_000, 60_000)],
      savedMkd: 200_000,
      goalStatuses: ['on_track', 'done'],
    });
    expect(r.score).toBe(100);
    expect(r.label).toBe('excellent');
    expect(r.improvements).toEqual([]);
  });

  it('scores each factor by its stated rule', () => {
    const r = healthScore({
      months: [month(100_000, 90_000), month(100_000, 110_000), month(100_000, 90_000)],
      savedMkd: 100_000,
      goalStatuses: ['behind'],
    });
    const by = Object.fromEntries(r.factors.map((f) => [f.key, f.score]));
    // saved 10,000 of 300,000 = 3.3 % → 3.3/20 = 17 %
    expect(by.savings_rate).toBe(17);
    // spent 96.7 % → (1 − 0.967)/0.2 = 17 %
    expect(by.spending_ratio).toBe(17);
    expect(by.consistency).toBe(67); // 2 of 3 months
    expect(by.goal_progress).toBe(40);
    // monthly spending 96,667 → 1.03 months of 3
    expect(by.emergency_fund).toBe(34);
    expect(r.score).toBe(Math.round((17 * 30 + 17 * 20 + 67 * 15 + 40 * 15 + 34 * 20) / 100));
    expect(r.label).toBe('needs_attention');
    expect(r.improvements).toHaveLength(2);
  });

  it('leaves out factors without data and re-weights the rest', () => {
    const r = healthScore({ months: [month(100_000, 80_000)], savedMkd: 0, goalStatuses: [] });
    expect(r.factors.map((f) => f.key).sort()).toEqual([
      'emergency_fund',
      'savings_rate',
      'spending_ratio',
    ]);
    expect(r.factors.reduce((t, f) => t + f.weight, 0)).toBe(100);
    expect(r.score).toBe(Math.round((100 * 30 + 100 * 20 + 0 * 20) / 70));
  });

  it('never goes below 0 or above 100', () => {
    const r = healthScore({
      months: [month(100, 1_000), month(100, 1_000), month(100, 1_000)],
      savedMkd: 0,
      goalStatuses: ['overdue'],
    });
    expect(r.score).toBe(0);
  });
});
