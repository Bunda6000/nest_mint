import { describe, expect, it } from 'vitest';
import { goalProgress, monthsBetween, recentPace, type GoalInput } from './goals.js';

const base: GoalInput = {
  kind: 'target_date',
  targetMkd: 120_000,
  targetMonth: '2027-10',
  monthlyMkd: null,
  savedMkd: 0,
  recentPaceMkd: 0,
  currentMonth: '2026-11',
};

describe('monthsBetween', () => {
  it('counts months across years, negative backwards', () => {
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
    expect(monthsBetween('2027-02', '2026-11')).toBe(-3);
  });
});

describe('recentPace', () => {
  it('averages the last three complete months', () => {
    const c = [
      { month: '2026-08', amountMkd: 3_000 },
      { month: '2026-09', amountMkd: 3_000 },
      { month: '2026-10', amountMkd: 6_000 },
      { month: '2026-11', amountMkd: 99_000 }, // the running month is not counted
    ];
    expect(recentPace(c, '2026-11')).toBe(4_000);
  });
  it('divides a young goal by the months it has existed', () => {
    expect(recentPace([{ month: '2026-10', amountMkd: 5_000 }], '2026-11')).toBe(5_000);
    expect(recentPace([{ month: '2026-09', amountMkd: 6_000 }], '2026-11')).toBe(3_000);
  });
  it('is 0 without contributions and never negative', () => {
    expect(recentPace([], '2026-11')).toBe(0);
    expect(recentPace([{ month: '2026-10', amountMkd: -500 }], '2026-11')).toBe(0);
  });
});

describe('goalProgress with a deadline', () => {
  it('works out the required monthly amount, counting the target month', () => {
    // Nov 2026 .. Oct 2027 = 12 months.
    const p = goalProgress({ ...base, savedMkd: 24_000 });
    expect(p.monthsLeft).toBe(12);
    expect(p.remainingMkd).toBe(96_000);
    expect(p.requiredMonthlyMkd).toBe(8_000);
    expect(p.progress).toBeCloseTo(0.2);
  });
  it('is on track when the pace covers it, with the finish month', () => {
    const p = goalProgress({ ...base, savedMkd: 24_000, recentPaceMkd: 10_000 });
    expect(p.status).toBe('on_track');
    expect(p.achievability).toBe(100);
    expect(p.completionMonth).toBe('2027-08'); // 96,000 / 10,000 = 10 months → Nov..Aug
  });
  it('is behind when the pace is too slow, with a share as achievability', () => {
    const p = goalProgress({ ...base, savedMkd: 24_000, recentPaceMkd: 4_000 });
    expect(p.status).toBe('behind');
    expect(p.achievability).toBe(50);
    expect(p.completionMonth).toBe('2028-10'); // 24 months
  });
  it('prefers the planned monthly amount over the recent pace', () => {
    const p = goalProgress({ ...base, monthlyMkd: 8_000, recentPaceMkd: 1_000 });
    expect(p.paceMkd).toBe(8_000);
  });
  it('has no pace to forecast from without savings', () => {
    const p = goalProgress(base);
    expect(p.status).toBe('no_pace');
    expect(p.completionMonth).toBeNull();
    expect(p.achievability).toBe(0);
  });
  it('is overdue after the deadline and done once reached', () => {
    const late = goalProgress({ ...base, targetMonth: '2026-10', savedMkd: 100 });
    expect(late.status).toBe('overdue');
    expect(late.monthsLeft).toBe(0);
    expect(late.requiredMonthlyMkd).toBe(119_900);
    const done = goalProgress({ ...base, savedMkd: 130_000 });
    expect(done).toMatchObject({
      status: 'done',
      progress: 1,
      remainingMkd: 0,
      achievability: 100,
    });
  });
});

describe('goalProgress without a deadline or monthly', () => {
  it('a target goal forecasts from the pace', () => {
    const p = goalProgress({ ...base, kind: 'target', targetMonth: null, recentPaceMkd: 20_000 });
    expect(p).toMatchObject({ status: 'on_track', completionMonth: '2027-04', monthsLeft: null });
  });
  it('a monthly goal is ongoing and has no progress share', () => {
    const p = goalProgress({
      ...base,
      kind: 'monthly',
      targetMkd: null,
      targetMonth: null,
      monthlyMkd: 5_000,
      savedMkd: 15_000,
    });
    expect(p).toMatchObject({
      status: 'ongoing',
      progress: null,
      paceMkd: 5_000,
      savedMkd: 15_000,
    });
  });
});
