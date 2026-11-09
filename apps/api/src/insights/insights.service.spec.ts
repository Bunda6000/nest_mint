import type { IncomeResponse } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewIncome } from '../income/income.repository.js';
import { InMemoryIncome } from '../testing/income-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { InsightsService } from './insights.service.js';
import { SummaryService } from '../summary/summary.service.js';

const A = 'user-a';
const B = 'user-b';

const NAMES: Record<string, string> = { food: 'Groceries', cafe: 'Restaurants', rent: 'Rent' };
const GROUPS: Record<string, { id: string; name: string }> = {
  food: { id: 'g-food', name: 'Food' },
  cafe: { id: 'g-food', name: 'Food' },
  rent: { id: 'g-home', name: 'Housing' },
};

let income: InMemoryIncome;
let transactions: InMemoryTransactions;
let service: InsightsService;

beforeEach(() => {
  income = new InMemoryIncome();
  transactions = new InMemoryTransactions(
    (_user, id) => NAMES[id] ?? 'Other',
    (_user, id) => GROUPS[id] ?? { id: 'g-other', name: 'Other' },
  );
  service = new InsightsService(income, transactions);
});

const salary = (user: string, over: Partial<NewIncome> = {}): Promise<IncomeResponse> =>
  income.create(user, {
    name: 'Salary',
    amountMkd: 100_000,
    recurrence: 'monthly',
    receivedOn: null,
    startMonth: '2025-01',
    endMonth: null,
    payDay: 25,
    ...over,
  });

const bonus = (user: string, amountMkd: number, receivedOn: string) =>
  income.create(user, {
    name: 'Bonus',
    amountMkd,
    recurrence: 'one_off',
    receivedOn,
    startMonth: null,
    endMonth: null,
    payDay: null,
  });

const spend = (
  user: string,
  amountMkd: number,
  occurredOn: string,
  categoryId = 'food',
  kind: 'expense' | 'cash_withdrawal' = 'expense',
) => transactions.create(user, { kind, categoryId, amountMkd, occurredOn, note: null });

describe('breakdown', () => {
  it('totals each category of the month, biggest first, with its group', async () => {
    await spend(A, 5_000, '2026-11-02', 'food');
    await spend(A, 3_000, '2026-11-09', 'food');
    await spend(A, 20_000, '2026-11-01', 'rent');
    await spend(A, 1_500, '2026-11-20', 'cafe');

    const { month, categories } = await service.breakdown(A, '2026-11');
    expect(month).toBe('2026-11');
    expect(categories).toEqual([
      {
        categoryId: 'rent',
        categoryName: 'Rent',
        groupId: 'g-home',
        groupName: 'Housing',
        amountMkd: 20_000,
      },
      {
        categoryId: 'food',
        categoryName: 'Groceries',
        groupId: 'g-food',
        groupName: 'Food',
        amountMkd: 8_000,
      },
      {
        categoryId: 'cafe',
        categoryName: 'Restaurants',
        groupId: 'g-food',
        groupName: 'Food',
        amountMkd: 1_500,
      },
    ]);
  });

  it("counts cash withdrawals, so the categories add up to the month's expenses", async () => {
    await salary(A);
    await spend(A, 5_000, '2026-11-02');
    await spend(A, 10_000, '2026-11-03', 'rent', 'cash_withdrawal');

    const { categories } = await service.breakdown(A, '2026-11');
    const sum = categories.reduce((total, c) => total + c.amountMkd, 0);
    const month = await new SummaryService(income, transactions).month(A, '2026-11');
    expect(sum).toBe(15_000);
    expect(sum).toBe(month.expensesMkd);
  });

  it('only counts the month asked for, first and last day included', async () => {
    await spend(A, 100, '2026-10-31');
    await spend(A, 200, '2026-11-01');
    await spend(A, 400, '2026-11-30');
    await spend(A, 800, '2026-12-01');
    const { categories, top } = await service.breakdown(A, '2026-11');
    expect(categories.map((c) => c.amountMkd)).toEqual([600]);
    expect(top.map((t) => t.amountMkd)).toEqual([400, 200]);
  });

  it('lists the five biggest transactions, biggest first, newest first on a tie', async () => {
    for (const [amount, day] of [
      [1_000, '01'],
      [9_000, '02'],
      [5_000, '03'],
      [5_000, '04'],
      [7_000, '05'],
      [300, '06'],
      [4_000, '07'],
    ] as const) {
      await spend(A, amount, `2026-11-${day}`);
    }
    const { top } = await service.breakdown(A, '2026-11');
    expect(top.map((t) => [t.amountMkd, t.occurredOn])).toEqual([
      [9_000, '2026-11-02'],
      [7_000, '2026-11-05'],
      [5_000, '2026-11-04'],
      [5_000, '2026-11-03'],
      [4_000, '2026-11-07'],
    ]);
    expect(top[0]).toMatchObject({ categoryName: 'Groceries', kind: 'expense' });
  });

  it('puts the one entered last first when amount and day are the same', async () => {
    for (const note of ['first', 'second', 'third']) {
      await transactions.create(A, {
        kind: 'expense',
        categoryId: 'food',
        amountMkd: 5_000,
        occurredOn: '2026-11-10',
        note,
      });
    }
    const { top } = await service.breakdown(A, '2026-11');
    expect(top.map((t) => t.note)).toEqual(['third', 'second', 'first']);
  });

  it('lists fewer than five when there are fewer', async () => {
    await spend(A, 100, '2026-11-02');
    expect((await service.breakdown(A, '2026-11')).top).toHaveLength(1);
  });

  it('is empty for a month with nothing in it', async () => {
    expect(await service.breakdown(A, '2026-11')).toEqual({
      month: '2026-11',
      categories: [],
      top: [],
    });
  });

  it("never shows another user's spending", async () => {
    await spend(B, 99_999, '2026-11-02', 'rent');
    await spend(A, 100, '2026-11-02');
    const { categories, top } = await service.breakdown(A, '2026-11');
    expect(categories.map((c) => c.amountMkd)).toEqual([100]);
    expect(top.map((t) => t.amountMkd)).toEqual([100]);
  });
});

describe('history', () => {
  it('covers twelve months ending at the one asked for, oldest first', async () => {
    const { months } = await service.history(A, '2026-11');
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe('2025-12');
    expect(months[11]!.month).toBe('2026-11');
  });

  it('gives income, expenses, net, running total and savings rate per month', async () => {
    await salary(A, { amountMkd: 100_000, startMonth: '2026-09' });
    await spend(A, 60_000, '2026-09-10');
    await spend(A, 120_000, '2026-10-10');
    await spend(A, 40_000, '2026-11-10');

    const { months } = await service.history(A, '2026-11');
    const last3 = months.slice(-3);
    expect(last3.map((m) => m.incomeMkd)).toEqual([100_000, 100_000, 100_000]);
    expect(last3.map((m) => m.expensesMkd)).toEqual([60_000, 120_000, 40_000]);
    expect(last3.map((m) => m.netMkd)).toEqual([40_000, -20_000, 60_000]);
    expect(last3.map((m) => m.cumulativeNetMkd)).toEqual([40_000, 20_000, 80_000]);
    expect(last3[1]!.savingsRate).toBeCloseTo(-0.2, 10);
    // Months before the salary started: nothing in, nothing out.
    expect(months[0]).toEqual({
      month: '2025-12',
      incomeMkd: 0,
      expensesMkd: 0,
      netMkd: 0,
      cumulativeNetMkd: 0,
      savingsRate: null,
    });
  });

  it('counts one-off income in its month and cash withdrawals as spending', async () => {
    await bonus(A, 30_000, '2026-11-15');
    await spend(A, 10_000, '2026-11-16', 'rent', 'cash_withdrawal');
    const november = (await service.history(A, '2026-11')).months[11]!;
    expect(november).toMatchObject({ incomeMkd: 30_000, expensesMkd: 10_000, netMkd: 20_000 });
  });

  it('ignores spending outside the twelve months', async () => {
    await spend(A, 77_000, '2025-11-30');
    await spend(A, 88_000, '2026-12-01');
    const { months } = await service.history(A, '2026-11');
    expect(months.every((m) => m.expensesMkd === 0)).toBe(true);
  });

  it('includes the first day of the first month and the last day of the last', async () => {
    await spend(A, 1_000, '2025-12-01');
    await spend(A, 2_000, '2026-11-30');
    const { months } = await service.history(A, '2026-11');
    expect(months[0]!.expensesMkd).toBe(1_000);
    expect(months[11]!.expensesMkd).toBe(2_000);
  });

  it('matches Budget.xlsx January 2025 (income 146,308, expenses 82,272)', async () => {
    await salary(A, { amountMkd: 146_308, startMonth: '2024-06' });
    for (const amount of [40_000, 25_000, 10_000, 7_272]) await spend(A, amount, '2025-01-15');
    const january = (await service.history(A, '2025-01')).months[11]!;
    expect(january).toMatchObject({
      month: '2025-01',
      incomeMkd: 146_308,
      expensesMkd: 82_272,
      netMkd: 64_036,
    });
    expect(january.savingsRate).toBeCloseTo(0.4377, 4);
  });

  it("never shows another user's income or spending", async () => {
    await salary(B, { amountMkd: 999_999 });
    await spend(B, 500_000, '2026-11-02');
    await salary(A, { amountMkd: 50_000, startMonth: '2026-11' });
    const november = (await service.history(A, '2026-11')).months[11]!;
    expect(november).toMatchObject({ incomeMkd: 50_000, expensesMkd: 0 });
  });
});
