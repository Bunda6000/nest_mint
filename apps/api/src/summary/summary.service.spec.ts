import type { IncomeResponse } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewIncome } from '../income/income.repository.js';
import { InMemoryIncome } from '../testing/income-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { SummaryService } from './summary.service.js';

const A = 'user-a';
const B = 'user-b';

let income: InMemoryIncome;
let transactions: InMemoryTransactions;
let service: SummaryService;

beforeEach(() => {
  income = new InMemoryIncome();
  transactions = new InMemoryTransactions(() => 'Category');
  service = new SummaryService(income, transactions);
});

const salary = (user: string, over: Partial<NewIncome> = {}): Promise<IncomeResponse> =>
  income.create(user, {
    name: 'Salary',
    amountMkd: 100_000,
    recurrence: 'monthly',
    receivedOn: null,
    startMonth: '2026-01',
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
  kind: 'expense' | 'cash_withdrawal' = 'expense',
) => transactions.create(user, { kind, categoryId: 'c1', amountMkd, occurredOn, note: null });

describe('month', () => {
  it('matches Budget.xlsx January 2025 (income 146,308, tracked expenses 82,272)', async () => {
    await salary(A, { amountMkd: 146_308, startMonth: '2024-06' });
    for (const amount of [40_000, 25_000, 10_000, 7_272]) await spend(A, amount, '2025-01-15');

    const result = await service.month(A, '2025-01');
    expect(result).toMatchObject({
      month: '2025-01',
      incomeMkd: 146_308,
      expensesMkd: 82_272,
      netMkd: 64_036,
    });
    expect(result.savingsRate).toBeCloseTo(0.4377, 4);
  });

  it('is all zero, with no savings rate, for a user with nothing', async () => {
    expect(await service.month(A, '2026-11')).toEqual({
      month: '2026-11',
      incomeMkd: 0,
      expensesMkd: 0,
      netMkd: 0,
      savingsRate: null,
    });
  });

  it('counts only the expenses of that month, the first and last day included', async () => {
    await spend(A, 1, '2025-12-31');
    await spend(A, 10, '2026-01-01');
    await spend(A, 100, '2026-01-31');
    await spend(A, 1_000, '2026-02-01');
    expect((await service.month(A, '2026-01')).expensesMkd).toBe(110);
    expect((await service.month(A, '2025-12')).expensesMkd).toBe(1);
    expect((await service.month(A, '2026-02')).expensesMkd).toBe(1_000);
  });

  it('counts cash withdrawals as spending', async () => {
    await spend(A, 5_000, '2026-11-02');
    await spend(A, 3_000, '2026-11-03', 'cash_withdrawal');
    expect((await service.month(A, '2026-11')).expensesMkd).toBe(8_000);
  });

  it('counts a salary only in the months it runs, and one-off income only in its month', async () => {
    await salary(A, { amountMkd: 100_000, startMonth: '2026-01', endMonth: '2026-05' });
    await salary(A, { amountMkd: 120_000, startMonth: '2026-06' });
    await bonus(A, 5_000, '2026-06-30');
    await bonus(A, 7_000, '2026-07-01');

    expect((await service.month(A, '2026-05')).incomeMkd).toBe(100_000);
    expect((await service.month(A, '2026-06')).incomeMkd).toBe(125_000);
    expect((await service.month(A, '2026-07')).incomeMkd).toBe(127_000);
    expect((await service.month(A, '2025-12')).incomeMkd).toBe(0);
  });

  it('works out net and savings rate from income and expenses', async () => {
    await salary(A, { amountMkd: 100_000 });
    await spend(A, 75_000, '2026-11-10');
    expect(await service.month(A, '2026-11')).toEqual({
      month: '2026-11',
      incomeMkd: 100_000,
      expensesMkd: 75_000,
      netMkd: 25_000,
      savingsRate: 0.25,
    });
  });

  it('shows a negative net when more was spent than earned', async () => {
    await salary(A, { amountMkd: 10_000 });
    await spend(A, 12_500, '2026-11-10');
    const result = await service.month(A, '2026-11');
    expect(result.netMkd).toBe(-2_500);
    expect(result.savingsRate).toBe(-0.25);
  });

  it('has no savings rate when there was spending but no income', async () => {
    await spend(A, 4_000, '2026-11-10');
    expect(await service.month(A, '2026-11')).toMatchObject({
      incomeMkd: 0,
      expensesMkd: 4_000,
      netMkd: -4_000,
      savingsRate: null,
    });
  });

  it("never mixes in another user's income or expenses", async () => {
    await salary(A, { amountMkd: 111 });
    await spend(A, 11, '2026-11-10');
    await salary(B, { amountMkd: 222_000 });
    await bonus(B, 5, '2026-11-02');
    await spend(B, 22_000, '2026-11-10');

    expect(await service.month(A, '2026-11')).toMatchObject({ incomeMkd: 111, expensesMkd: 11 });
    expect(await service.month(B, '2026-11')).toMatchObject({
      incomeMkd: 222_005,
      expensesMkd: 22_000,
    });
  });
});
