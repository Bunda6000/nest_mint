import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import type { NewIncome } from '../income/income.repository.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { InMemoryCategories } from '../testing/fakes.js';
import { InMemoryIncome } from '../testing/income-fake.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { BudgetService } from './budget.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let income: InMemoryIncome;
let transactions: InMemoryTransactions;
let obligations: InMemoryObligations;
let bills: InMemoryBills;
let service: BudgetService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  const nameOf = (userId: string, id: string) =>
    categories.categories.find((c) => c.userId === userId && c.id === id)!.name;
  const groupOf = (userId: string, id: string) => {
    const category = categories.categories.find((c) => c.userId === userId && c.id === id)!;
    const group = categories.groups.find((g) => g.id === category.groupId)!;
    return { id: group.id, name: group.name };
  };
  income = new InMemoryIncome();
  transactions = new InMemoryTransactions(nameOf, groupOf);
  obligations = new InMemoryObligations(nameOf);
  bills = new InMemoryBills(obligations, transactions, groupOf);
  service = new BudgetService(income, transactions, bills, categories);
});

const category = (name: string, user = A) =>
  categories.categories.find((c) => c.userId === user && c.name === name)!;
const groupId = (name: string, user = A) =>
  categories.groups.find((g) => g.userId === user && g.name === name)!.id;

const spend = (
  user: string,
  categoryName: string,
  amountMkd: number,
  occurredOn: string,
  kind: 'expense' | 'cash_withdrawal' = 'expense',
) =>
  transactions.create(user, {
    kind,
    categoryId: category(categoryName, user).id,
    amountMkd,
    occurredOn,
    note: null,
  });

async function expectBill(user: string, categoryName: string, amountMkd: number, period: string) {
  const o = await obligations.create(user, {
    name: `${categoryName} bill`,
    payee: null,
    categoryId: category(categoryName, user).id,
    expectedAmountMkd: amountMkd,
    dueDay: 10,
    recurrence: 'monthly',
    everyNMonths: null,
    months: [],
    startMonth: period,
    endMonth: null,
  });
  await bills.createMissing(user, [
    { obligationId: o.id, period, dueDate: `${period}-10`, expectedAmountMkd: amountMkd },
  ]);
}

const salary = (user: string, over: Partial<NewIncome> = {}) =>
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

const row = (grid: Awaited<ReturnType<BudgetService['year']>>, name: string) =>
  grid.groups.find((g) => g.groupName === name)!;

describe('BudgetService.year', () => {
  it('has a row for every active group, in display order, and twelve months, also for a new user', async () => {
    const grid = await service.year(A, 2026);
    expect(grid.year).toBe(2026);
    expect(grid.months).toHaveLength(12);
    expect(grid.groups.map((g) => g.groupName).slice(0, 3)).toEqual(['Banks', 'Home', 'Child']);
    expect(grid.groups.every((g) => g.months.length === 12)).toBe(true);
    expect(grid.expensesTotal).toEqual({ plannedMkd: null, actualMkd: 0 });
    expect(grid.netTotalMkd).toBe(0);
    expect(grid.savingsRateTotal).toBeNull();
  });

  it('puts spending in its group and month, cash withdrawals included, and adds the totals', async () => {
    await spend(A, 'Electricity', 3_460, '2026-01-12');
    await spend(A, 'Water', 705, '2026-01-20');
    await spend(A, 'Electricity', 4_881, '2026-02-03');
    await spend(A, 'Cash withdrawal', 1_900, '2026-01-05', 'cash_withdrawal');
    const grid = await service.year(A, 2026);
    expect(row(grid, 'Home').months[0]!.actualMkd).toBe(4_165);
    expect(row(grid, 'Home').months[1]!.actualMkd).toBe(4_881);
    expect(row(grid, 'Home').total.actualMkd).toBe(9_046);
    expect(row(grid, 'Banks').months[0]!.actualMkd).toBe(1_900);
    expect(grid.expenses[0]!.actualMkd).toBe(6_065);
    expect(grid.expensesTotal.actualMkd).toBe(10_946);
  });

  it('ignores spending of other years and of other users', async () => {
    await spend(A, 'Electricity', 100, '2025-12-31');
    await spend(A, 'Electricity', 200, '2027-01-01');
    await spend(B, 'Electricity', 999, '2026-03-03');
    const grid = await service.year(A, 2026);
    expect(grid.expensesTotal.actualMkd).toBe(0);
    expect((await service.year(B, 2026)).expensesTotal.actualMkd).toBe(999);
  });

  it('takes the plan from the expected amounts of bills, paid or not, and keeps "no plan" null', async () => {
    await expectBill(A, 'Electricity', 4_000, '2026-03');
    await expectBill(A, 'Water', 700, '2026-03');
    await expectBill(A, 'Kindergarten', 19_500, '2026-04');
    await expectBill(B, 'Electricity', 1, '2026-03');
    const grid = await service.year(A, 2026);
    expect(row(grid, 'Home').months[2]!.plannedMkd).toBe(4_700);
    expect(row(grid, 'Home').months[0]!.plannedMkd).toBeNull();
    expect(row(grid, 'Child').months[3]!.plannedMkd).toBe(19_500);
    expect(row(grid, 'Banks').total.plannedMkd).toBeNull();
    expect(grid.expensesTotal.plannedMkd).toBe(24_200);
  });

  it('shows planned and actual of a group side by side', async () => {
    await expectBill(A, 'Electricity', 4_000, '2026-03');
    await spend(A, 'Electricity', 4_250, '2026-03-12');
    const march = row(await service.year(A, 2026), 'Home').months[2]!;
    expect(march).toEqual({ plannedMkd: 4_000, actualMkd: 4_250 });
  });

  it('works out income, net and savings rate by month and for the year', async () => {
    await salary(A, { amountMkd: 127_088 });
    await spend(A, 'Electricity', 27_088, '2026-02-10');
    const grid = await service.year(A, 2026);
    expect(grid.incomeMkd[0]).toBe(127_088);
    expect(grid.incomeTotalMkd).toBe(127_088 * 12);
    expect(grid.netMkd[1]).toBe(100_000);
    expect(grid.savingsRate[1]).toBeCloseTo(100_000 / 127_088);
    expect(grid.netTotalMkd).toBe(127_088 * 12 - 27_088);
    expect(grid.savingsRate[0]).toBe(1);
  });

  it("does not show another user's income", async () => {
    await salary(B);
    expect((await service.year(A, 2026)).incomeTotalMkd).toBe(0);
  });

  it('shows an archived group only when it has amounts that year', async () => {
    await spend(A, 'Electricity', 500, '2026-05-05');
    await categories.updateGroup(A, groupId('Home'), { archived: true });
    await categories.updateGroup(A, groupId('Child'), { archived: true });
    const grid = await service.year(A, 2026);
    const names = grid.groups.map((g) => g.groupName);
    expect(names).toContain('Home');
    expect(names).not.toContain('Child');
    expect(grid.expensesTotal.actualMkd).toBe(500);
  });
});
