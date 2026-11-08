import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { TransactionsService } from './transactions.service.js';

const A = 'user-a';
const B = 'user-b';
// FakeClock starts at 2026-11-08T10:00:00Z.
const TODAY = '2026-11-08';

let categories: InMemoryCategories;
let repository: InMemoryTransactions;
let service: TransactionsService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  repository = new InMemoryTransactions(
    (userId, id) => categories.categories.find((c) => c.userId === userId && c.id === id)!.name,
  );
  service = new TransactionsService(repository, categories, new FakeClock());
});

const categoryId = (name: string, user = A): string =>
  categories.categories.find((c) => c.userId === user && c.name === name)!.id;

const expense = (name: string, amountMkd: number, occurredOn = TODAY, note?: string) => ({
  categoryId: categoryId(name),
  amountMkd,
  occurredOn,
  ...(note !== undefined ? { note } : {}),
});

async function failure(call: Promise<unknown>): Promise<HttpException> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { error: { code: string } }).error.code;

describe('createExpense', () => {
  it('saves the expense and answers with the category name', async () => {
    const saved = await service.createExpense(A, expense('Groceries', 450, '2026-11-07', 'Vero'));
    expect(saved).toMatchObject({
      categoryId: categoryId('Groceries'),
      categoryName: 'Groceries',
      amountMkd: 450,
      occurredOn: '2026-11-07',
      note: 'Vero',
    });
  });

  it('stores a missing or empty note as null', async () => {
    expect((await service.createExpense(A, expense('Groceries', 100))).note).toBeNull();
    expect((await service.createExpense(A, expense('Groceries', 100, TODAY, ''))).note).toBeNull();
  });

  it('answers "not found" for an unknown category and for another user\'s category', async () => {
    const unknown = await failure(
      service.createExpense(A, { categoryId: 'missing', amountMkd: 10, occurredOn: TODAY }),
    );
    expect(unknown.getStatus()).toBe(404);

    const others = await failure(
      service.createExpense(A, {
        categoryId: categoryId('Groceries', B),
        amountMkd: 10,
        occurredOn: TODAY,
      }),
    );
    expect(others.getStatus()).toBe(404);
    expect(codeOf(others)).toBe(ErrorCode.NotFound);
    expect(repository.rows).toHaveLength(0);
  });

  it('refuses an archived category, and a category whose group is archived', async () => {
    await categories.updateCategory(A, categoryId('Groceries'), { archived: true });
    const archived = await failure(service.createExpense(A, expense('Groceries', 10)));
    expect(archived.getStatus()).toBe(409);
    expect(codeOf(archived)).toBe(ErrorCode.Conflict);

    const home = categories.groups.find((g) => g.userId === A && g.name === 'Home')!;
    await categories.updateGroup(A, home.id, { archived: true });
    expect((await failure(service.createExpense(A, expense('Water', 10)))).getStatus()).toBe(409);
    expect(repository.rows).toHaveLength(0);
  });

  it('allows today and tomorrow (time zone slack) but not later', async () => {
    await service.createExpense(A, expense('Groceries', 10, '2026-11-09'));
    const error = await failure(service.createExpense(A, expense('Groceries', 10, '2026-11-10')));
    expect(error.getStatus()).toBe(400);
    expect(codeOf(error)).toBe(ErrorCode.ValidationFailed);
    expect(
      (error.getResponse() as { error: { details: Record<string, string> } }).error.details,
    ).toEqual({ occurredOn: 'Date cannot be in the future' });
  });

  it('allows old dates', async () => {
    const saved = await service.createExpense(A, expense('Groceries', 10, '2023-01-31'));
    expect(saved.occurredOn).toBe('2023-01-31');
  });
});

describe('listRecent', () => {
  it('lists newest first: by date, then by the order they were entered', async () => {
    await service.createExpense(A, expense('Groceries', 1, '2026-11-05'));
    await service.createExpense(A, expense('Groceries', 2, '2026-11-07'));
    await service.createExpense(A, expense('Restaurants', 3, '2026-11-07'));
    await service.createExpense(A, expense('Groceries', 4, '2026-11-06'));

    const { transactions } = await service.listRecent(A);
    expect(transactions.map((t) => t.amountMkd)).toEqual([3, 2, 4, 1]);
  });

  it("shows only the user's own expenses", async () => {
    await service.createExpense(A, expense('Groceries', 111));
    await service.createExpense(B, {
      ...expense('Groceries', 222),
      categoryId: categoryId('Groceries', B),
    });

    expect((await service.listRecent(A)).transactions.map((t) => t.amountMkd)).toEqual([111]);
    expect((await service.listRecent(B)).transactions.map((t) => t.amountMkd)).toEqual([222]);
  });

  it('returns an empty list when there is nothing yet', async () => {
    expect(await service.listRecent(A)).toEqual({ transactions: [] });
  });

  it('shows 10 by default and never fewer than 1 or more than 50', async () => {
    for (let i = 1; i <= 60; i++) await service.createExpense(A, expense('Groceries', i));

    expect((await service.listRecent(A)).transactions).toHaveLength(10);
    expect((await service.listRecent(A, 3)).transactions).toHaveLength(3);
    expect((await service.listRecent(A, 0)).transactions).toHaveLength(1);
    expect((await service.listRecent(A, -5)).transactions).toHaveLength(1);
    expect((await service.listRecent(A, 999)).transactions).toHaveLength(50);
    expect((await service.listRecent(A, Number.NaN)).transactions).toHaveLength(10);
  });
});
