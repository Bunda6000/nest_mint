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

describe('kind', () => {
  it('is an expense unless a cash withdrawal is asked for', async () => {
    expect((await service.createExpense(A, expense('Groceries', 10))).kind).toBe('expense');
    const withdrawal = await service.createExpense(A, {
      ...expense('Cash withdrawal', 5000),
      kind: 'cash_withdrawal',
    });
    expect(withdrawal.kind).toBe('cash_withdrawal');
    expect((await service.listRecent(A)).transactions.map((t) => t.kind)).toEqual([
      'cash_withdrawal',
      'expense',
    ]);
  });
});

describe('listMonth', () => {
  beforeEach(async () => {
    for (const [name, amount, day] of [
      ['Groceries', 1, '2025-10-31'],
      ['Groceries', 20, '2025-11-01'],
      ['Restaurants', 300, '2025-11-15'],
      ['Groceries', 4000, '2025-11-30'],
      ['Groceries', 50000, '2025-12-01'],
    ] as const) {
      await service.createExpense(A, expense(name, amount, day));
    }
  });

  it('holds exactly the calendar month, first and last day included, newest first', async () => {
    const result = await service.listMonth(A, '2025-11');
    expect(result.month).toBe('2025-11');
    expect(result.transactions.map((t) => t.amountMkd)).toEqual([4000, 300, 20]);
    expect(result.totalMkd).toBe(4320);
  });

  it('narrows the list and the total to one category', async () => {
    const result = await service.listMonth(A, '2025-11', categoryId('Groceries'));
    expect(result.transactions.map((t) => t.amountMkd)).toEqual([4000, 20]);
    expect(result.totalMkd).toBe(4020);
  });

  it('has a total of 0 for a month without expenses', async () => {
    expect(await service.listMonth(A, '2025-09')).toEqual({
      month: '2025-09',
      transactions: [],
      totalMkd: 0,
    });
  });

  it("leaves out another user's expenses, in the list and in the total", async () => {
    await service.createExpense(B, {
      ...expense('Groceries', 999_999, '2025-11-10'),
      categoryId: categoryId('Groceries', B),
    });
    const mine = await service.listMonth(A, '2025-11');
    expect(mine.totalMkd).toBe(4320);
    expect(mine.transactions).toHaveLength(3);
    // Asking for the other user's category shows nothing, not their data.
    expect(
      (await service.listMonth(A, '2025-11', categoryId('Groceries', B))).transactions,
    ).toEqual([]);
  });
});

describe('updateExpense', () => {
  const addOne = () => service.createExpense(A, expense('Groceries', 450, '2026-11-07', 'Vero'));

  it('changes only what was sent', async () => {
    const saved = await addOne();
    const updated = await service.updateExpense(A, saved.id, { amountMkd: 500 });
    expect(updated).toEqual({ ...saved, amountMkd: 500 });
  });

  it('can change several fields at once, including the category', async () => {
    const saved = await addOne();
    const updated = await service.updateExpense(A, saved.id, {
      categoryId: categoryId('Water'),
      amountMkd: 640,
      occurredOn: '2026-11-01',
      note: 'Oct bill',
    });
    expect(updated).toMatchObject({
      categoryId: categoryId('Water'),
      categoryName: 'Water',
      amountMkd: 640,
      occurredOn: '2026-11-01',
      note: 'Oct bill',
    });
  });

  it('clears the note with an empty text or null', async () => {
    const saved = await addOne();
    expect((await service.updateExpense(A, saved.id, { note: '' })).note).toBeNull();
    await service.updateExpense(A, saved.id, { note: 'back again' });
    expect((await service.updateExpense(A, saved.id, { note: null })).note).toBeNull();
  });

  it('never changes the kind', async () => {
    const withdrawal = await service.createExpense(A, {
      ...expense('Cash withdrawal', 5000),
      kind: 'cash_withdrawal',
    });
    const updated = await service.updateExpense(A, withdrawal.id, { amountMkd: 6000 });
    expect(updated.kind).toBe('cash_withdrawal');
  });

  it('answers "not found" for an unknown id and for another user\'s expense, changing nothing', async () => {
    const saved = await addOne();
    const unknown = await failure(service.updateExpense(A, 'tx-999', { amountMkd: 1 }));
    expect(unknown.getStatus()).toBe(404);

    const others = await failure(service.updateExpense(B, saved.id, { amountMkd: 1 }));
    expect(others.getStatus()).toBe(404);
    expect(codeOf(others)).toBe(ErrorCode.NotFound);
    expect((await service.listRecent(A)).transactions[0]!.amountMkd).toBe(450);
  });

  it("refuses a move to an archived category, and to another user's category", async () => {
    const saved = await addOne();
    await categories.updateCategory(A, categoryId('Water'), { archived: true });

    const archived = await failure(
      service.updateExpense(A, saved.id, { categoryId: categoryId('Water') }),
    );
    expect(archived.getStatus()).toBe(409);

    const foreign = await failure(
      service.updateExpense(A, saved.id, { categoryId: categoryId('Water', B) }),
    );
    expect(foreign.getStatus()).toBe(404);
    expect((await service.listRecent(A)).transactions[0]!.categoryName).toBe('Groceries');
  });

  it('still allows editing an expense whose own category was archived since', async () => {
    const saved = await addOne();
    await categories.updateCategory(A, categoryId('Groceries'), { archived: true });

    const sameCategory = await service.updateExpense(A, saved.id, {
      categoryId: categoryId('Groceries'),
      amountMkd: 777,
    });
    expect(sameCategory.amountMkd).toBe(777);
    expect((await service.updateExpense(A, saved.id, { note: 'still ok' })).note).toBe('still ok');
  });

  it('refuses a date in the future, changing nothing', async () => {
    const saved = await addOne();
    const error = await failure(service.updateExpense(A, saved.id, { occurredOn: '2026-11-10' }));
    expect(error.getStatus()).toBe(400);
    expect(
      (await service.updateExpense(A, saved.id, { occurredOn: '2026-11-09' })).occurredOn,
    ).toBe('2026-11-09');
  });
});

describe('deleteExpense', () => {
  it('removes exactly that expense and keeps the others', async () => {
    const first = await service.createExpense(A, expense('Groceries', 1));
    const second = await service.createExpense(A, expense('Groceries', 2));
    const third = await service.createExpense(A, expense('Groceries', 3));

    await service.deleteExpense(A, second.id);

    expect((await service.listRecent(A)).transactions.map((t) => t.id)).toEqual([
      third.id,
      first.id,
    ]);
  });

  it('answers "not found" the second time, and for an unknown id', async () => {
    const saved = await service.createExpense(A, expense('Groceries', 1));
    await service.deleteExpense(A, saved.id);
    expect((await failure(service.deleteExpense(A, saved.id))).getStatus()).toBe(404);
    expect((await failure(service.deleteExpense(A, 'tx-999'))).getStatus()).toBe(404);
  });

  it("refuses to delete another user's expense, which stays", async () => {
    const saved = await service.createExpense(A, expense('Groceries', 1));
    const error = await failure(service.deleteExpense(B, saved.id));
    expect(error.getStatus()).toBe(404);
    expect((await service.listRecent(A)).transactions).toHaveLength(1);
  });
});
