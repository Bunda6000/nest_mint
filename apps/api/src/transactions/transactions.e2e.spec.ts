import type {
  CategoriesResponse,
  TransactionResponse,
  TransactionsResponse,
} from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from './transactions.repository.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('transactions', () => {
  const e2e = new E2eHarness('@transactions-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  const today = () => new Date().toISOString().slice(0, 10);

  /** Id of a default category of this user (this also creates the defaults). */
  async function categoryId(user: E2eUser, name: string): Promise<string> {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    const found = groups.flatMap((g) => g.categories).find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  }

  async function add(
    user: E2eUser,
    name: string,
    amountMkd: number,
    occurredOn = today(),
    note?: string,
  ) {
    return e2e
      .post('/transactions', user, {
        categoryId: await categoryId(user, name),
        amountMkd,
        occurredOn,
        ...(note !== undefined ? { note } : {}),
      })
      .expect(201);
  }

  const recent = async (user: E2eUser, query = ''): Promise<TransactionResponse[]> =>
    ((await e2e.get(`/transactions${query}`, user).expect(200)).body as TransactionsResponse)
      .transactions;

  describe('login', () => {
    it('is required', async () => {
      await e2e.http().get('/api/v1/transactions').expect(401);
      await e2e
        .http()
        .post('/api/v1/transactions')
        .send({ categoryId: randomUUID(), amountMkd: 1, occurredOn: today() })
        .expect(401);
    });
  });

  describe('adding an expense', () => {
    it('saves it and answers with the category name', async () => {
      const user = await e2e.newUser();
      const response = await add(user, 'Groceries', 450, '2026-11-07', '  Vero  ');

      expect(response.body).toMatchObject({
        categoryName: 'Groceries',
        amountMkd: 450,
        occurredOn: '2026-11-07',
        note: 'Vero',
      });
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('stores the calendar day exactly, whatever the time zone', async () => {
      const user = await e2e.newUser();
      await add(user, 'Groceries', 1, '2026-01-01');
      await add(user, 'Groceries', 2, '2025-12-31');
      await add(user, 'Groceries', 3, '2024-02-29');

      const dates = (await recent(user)).map((t) => t.occurredOn);
      expect(dates).toEqual(['2026-01-01', '2025-12-31', '2024-02-29']);
    });

    it('stores an empty note as nothing', async () => {
      const user = await e2e.newUser();
      expect((await add(user, 'Groceries', 100, today(), '')).body.note).toBeNull();
      expect((await add(user, 'Groceries', 100)).body.note).toBeNull();
    });

    it('refuses invalid input with field messages', async () => {
      const user = await e2e.newUser();
      const category = await categoryId(user, 'Groceries');
      const base = { categoryId: category, amountMkd: 450, occurredOn: today() };

      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['zero', { ...base, amountMkd: 0 }, 'amountMkd'],
        ['negative', { ...base, amountMkd: -5 }, 'amountMkd'],
        ['decimal', { ...base, amountMkd: 12.5 }, 'amountMkd'],
        ['text', { ...base, amountMkd: '450' }, 'amountMkd'],
        ['too large', { ...base, amountMkd: 100_000_001 }, 'amountMkd'],
        ['missing amount', { categoryId: category, occurredOn: today() }, 'amountMkd'],
        ['bad category id', { ...base, categoryId: 'nope' }, 'categoryId'],
        ['impossible date', { ...base, occurredOn: '2026-02-30' }, 'occurredOn'],
        ['wrong date format', { ...base, occurredOn: '08.11.2026' }, 'occurredOn'],
        ['long note', { ...base, note: 'x'.repeat(201) }, 'note'],
      ];
      for (const [label, body, field] of cases) {
        const response = await e2e.post('/transactions', user, body);
        expect(response.status, label).toBe(400);
        expect(errorOf(response.body).code, label).toBe('VALIDATION_FAILED');
        expect(Object.keys(errorOf(response.body).details ?? {}), label).toContain(field);
      }
      expect(await recent(user)).toEqual([]);
    });

    it('refuses a date more than a day ahead, but accepts tomorrow', async () => {
      const user = await e2e.newUser();
      const category = await categoryId(user, 'Groceries');
      const inDays = (n: number) =>
        new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

      await e2e
        .post('/transactions', user, { categoryId: category, amountMkd: 5, occurredOn: inDays(1) })
        .expect(201);
      const late = await e2e
        .post('/transactions', user, { categoryId: category, amountMkd: 5, occurredOn: inDays(3) })
        .expect(400);
      expect(errorOf(late.body).details).toEqual({ occurredOn: 'Date cannot be in the future' });
    });

    it('refuses an archived category', async () => {
      const user = await e2e.newUser();
      const category = await categoryId(user, 'Groceries');
      await e2e.patch(`/categories/${category}`, user, { archived: true }).expect(200);

      const response = await e2e
        .post('/transactions', user, { categoryId: category, amountMkd: 5, occurredOn: today() })
        .expect(409);
      expect(errorOf(response.body).code).toBe('CONFLICT');
    });

    it('refuses a category of a group that is archived', async () => {
      const user = await e2e.newUser();
      const { groups } = (await e2e.get('/categories', user).expect(200))
        .body as CategoriesResponse;
      const food = groups.find((g) => g.name === 'Food')!;
      await e2e.patch(`/categories/groups/${food.id}`, user, { archived: true }).expect(200);

      await e2e
        .post('/transactions', user, {
          categoryId: food.categories[0]!.id,
          amountMkd: 5,
          occurredOn: today(),
        })
        .expect(409);
    });
  });

  describe('recent expenses', () => {
    it('lists newest first: by date, then by when they were entered', async () => {
      const user = await e2e.newUser();
      await add(user, 'Groceries', 1, '2026-11-05');
      await add(user, 'Groceries', 2, '2026-11-07');
      await add(user, 'Restaurants', 3, '2026-11-07');
      await add(user, 'Groceries', 4, '2026-11-06');

      expect((await recent(user)).map((t) => t.amountMkd)).toEqual([3, 2, 4, 1]);
    });

    it('limits the list: 10 by default, 1 to 50 when asked', async () => {
      const user = await e2e.newUser();
      for (let i = 1; i <= 12; i++) await add(user, 'Groceries', i);

      expect(await recent(user)).toHaveLength(10);
      expect(await recent(user, '?limit=3')).toHaveLength(3);
      expect(await recent(user, '?limit=0')).toHaveLength(1);
      expect(await recent(user, '?limit=999')).toHaveLength(12);
      expect(await recent(user, '?limit=abc')).toHaveLength(10);
      expect(await recent(user, '?limit=-4')).toHaveLength(10);
    });

    it('is empty for a new user', async () => {
      expect(await recent(await e2e.newUser())).toEqual([]);
    });
  });

  describe("another user's data", () => {
    it("never shows one user's expenses to another", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await add(alice, 'Groceries', 111);
      await add(bob, 'Groceries', 222);

      expect((await recent(alice)).map((t) => t.amountMkd)).toEqual([111]);
      expect((await recent(bob)).map((t) => t.amountMkd)).toEqual([222]);
    });

    it("refuses another user's category, as if it did not exist", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const alicesCategory = await categoryId(alice, 'Groceries');
      await categoryId(bob, 'Groceries');

      const response = await e2e
        .post('/transactions', bob, {
          categoryId: alicesCategory,
          amountMkd: 5,
          occurredOn: today(),
        })
        .expect(404);
      expect(errorOf(response.body).code).toBe('NOT_FOUND');
      expect(await recent(bob)).toEqual([]);
      expect(await recent(alice)).toEqual([]);
    });

    it("is enforced by the database: an expense cannot use another user's category", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const alicesCategory = await categoryId(alice, 'Groceries');

      await expect(
        e2e.prisma.transaction.create({
          data: {
            id: randomUUID(),
            userId: bob.id,
            categoryId: alicesCategory,
            amountMkd: 5,
            occurredOn: new Date(`${today()}T00:00:00.000Z`),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });
  });

  describe('database rules', () => {
    const insert = async (user: E2eUser, data: { amountMkd?: number; note?: string | null }) =>
      e2e.prisma.transaction.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          categoryId: await categoryId(user, 'Groceries'),
          amountMkd: data.amountMkd ?? 5,
          occurredOn: new Date(`${today()}T00:00:00.000Z`),
          note: data.note ?? null,
        },
      });

    it('refuses an amount outside 1 to 100,000,000 even if the application let it through', async () => {
      const user = await e2e.newUser();
      await expect(insert(user, { amountMkd: 0 })).rejects.toThrow();
      await expect(insert(user, { amountMkd: -1 })).rejects.toThrow();
      await expect(insert(user, { amountMkd: 100_000_001 })).rejects.toThrow();
      await expect(insert(user, { amountMkd: 100_000_000 })).resolves.toBeDefined();
    });

    it('refuses a note over 200 characters', async () => {
      const user = await e2e.newUser();
      await expect(insert(user, { note: 'x'.repeat(201) })).rejects.toThrow();
      await expect(insert(user, { note: 'x'.repeat(200) })).resolves.toBeDefined();
    });

    it('removes the expenses together with the user, although a category in use cannot be deleted', async () => {
      const user = await e2e.newUser();
      const category = await categoryId(user, 'Groceries');
      await add(user, 'Groceries', 50);

      await expect(
        e2e.prisma.category.deleteMany({ where: { id: category, userId: user.id } }),
      ).rejects.toThrow();

      await e2e.prisma.user.delete({ where: { id: user.id } });
      expect(await e2e.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
      expect(await e2e.prisma.category.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('cash withdrawals', () => {
    it('are tagged, listed with their kind, and an expense by default', async () => {
      const user = await e2e.newUser();
      const category = await categoryId(user, 'Cash withdrawal');
      const withdrawal = await e2e
        .post('/transactions', user, {
          categoryId: category,
          amountMkd: 5000,
          occurredOn: '2025-11-02',
          kind: 'cash_withdrawal',
        })
        .expect(201);
      expect(withdrawal.body.kind).toBe('cash_withdrawal');
      expect((await add(user, 'Groceries', 10, '2025-11-03')).body.kind).toBe('expense');

      expect((await recent(user)).map((t) => t.kind)).toEqual(['expense', 'cash_withdrawal']);
    });

    it('refuse an unknown kind', async () => {
      const user = await e2e.newUser();
      const response = await e2e
        .post('/transactions', user, {
          categoryId: await categoryId(user, 'Groceries'),
          amountMkd: 5,
          occurredOn: today(),
          kind: 'income',
        })
        .expect(400);
      expect(Object.keys(errorOf(response.body).details ?? {})).toContain('kind');
    });

    it('cannot be turned into an expense by editing', async () => {
      const user = await e2e.newUser();
      const withdrawal = await e2e
        .post('/transactions', user, {
          categoryId: await categoryId(user, 'Cash withdrawal'),
          amountMkd: 5000,
          occurredOn: '2025-11-02',
          kind: 'cash_withdrawal',
        })
        .expect(201);
      const id = withdrawal.body.id as string;

      await e2e.patch(`/transactions/${id}`, user, { kind: 'expense' }).expect(400);
      const edited = await e2e.patch(`/transactions/${id}`, user, { amountMkd: 6000 }).expect(200);
      expect(edited.body).toMatchObject({ kind: 'cash_withdrawal', amountMkd: 6000 });
    });
  });

  describe('a month', () => {
    const month = async (user: E2eUser, query: string) =>
      (await e2e.get(`/transactions?${query}`, user).expect(200)).body as {
        month: string;
        totalMkd: number;
        transactions: TransactionResponse[];
      };

    async function fill(user: E2eUser) {
      await add(user, 'Groceries', 1, '2025-10-31');
      await add(user, 'Groceries', 20, '2025-11-01');
      await add(user, 'Restaurants', 300, '2025-11-15');
      await add(user, 'Groceries', 4000, '2025-11-30');
      await add(user, 'Groceries', 50000, '2025-12-01');
    }

    it('holds exactly that calendar month, with its total, newest first', async () => {
      const user = await e2e.newUser();
      await fill(user);

      const result = await month(user, 'month=2025-11');
      expect(result.month).toBe('2025-11');
      expect(result.transactions.map((t) => t.amountMkd)).toEqual([4000, 300, 20]);
      expect(result.totalMkd).toBe(4320);
    });

    it('works for February, a leap February and December', async () => {
      const user = await e2e.newUser();
      await add(user, 'Groceries', 1, '2024-02-29');
      await add(user, 'Groceries', 2, '2024-03-01');
      await add(user, 'Groceries', 4, '2025-12-31');
      await add(user, 'Groceries', 8, '2025-01-01');

      expect((await month(user, 'month=2024-02')).totalMkd).toBe(1);
      expect((await month(user, 'month=2024-03')).totalMkd).toBe(2);
      expect((await month(user, 'month=2025-12')).totalMkd).toBe(4);
      expect((await month(user, 'month=2025-01')).totalMkd).toBe(8);
    });

    it('can be narrowed to one category, and the total follows', async () => {
      const user = await e2e.newUser();
      await fill(user);
      const groceries = await categoryId(user, 'Groceries');

      const result = await month(user, `month=2025-11&categoryId=${groceries}`);
      expect(result.transactions.map((t) => t.amountMkd)).toEqual([4000, 20]);
      expect(result.totalMkd).toBe(4020);
    });

    it('is empty with a total of 0 when nothing was spent', async () => {
      const user = await e2e.newUser();
      expect(await month(user, 'month=2025-09')).toEqual({
        month: '2025-09',
        transactions: [],
        totalMkd: 0,
      });
    });

    it('refuses a bad month, a bad category id, and a category without a month', async () => {
      const user = await e2e.newUser();
      for (const [query, field] of [
        ['month=2025-13', 'month'],
        ['month=2025-1', 'month'],
        ['month=November', 'month'],
        ['month=', 'month'],
        ['month=2025-11&month=2025-12', 'month'],
        ['month=2025-11&categoryId=nope', 'categoryId'],
        [`categoryId=${randomUUID()}`, 'month'],
      ] as const) {
        const response = await e2e.get(`/transactions?${query}`, user);
        expect(response.status, query).toBe(400);
        expect(errorOf(response.body).code, query).toBe('VALIDATION_FAILED');
        expect(Object.keys(errorOf(response.body).details ?? {}), query).toContain(field);
      }
    });

    it("never includes another user's expenses, even when their category id is asked for", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await add(alice, 'Groceries', 111, '2025-11-05');
      await add(bob, 'Groceries', 222, '2025-11-05');

      const mine = await month(alice, 'month=2025-11');
      expect(mine.totalMkd).toBe(111);
      expect(mine.transactions.map((t) => t.amountMkd)).toEqual([111]);

      const bobsCategory = await categoryId(bob, 'Groceries');
      const probe = await month(alice, `month=2025-11&categoryId=${bobsCategory}`);
      expect(probe).toEqual({ month: '2025-11', transactions: [], totalMkd: 0 });
    });
  });

  describe('editing an expense', () => {
    const addOne = async (user: E2eUser) =>
      (await add(user, 'Groceries', 450, '2025-11-07', 'Vero')).body as TransactionResponse;

    it('changes only the fields that were sent', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);

      const response = await e2e
        .patch(`/transactions/${saved.id}`, user, { amountMkd: 500 })
        .expect(200);
      expect(response.body).toEqual({ ...saved, amountMkd: 500 });
      expect(await recent(user)).toEqual([{ ...saved, amountMkd: 500 }]);
    });

    it('can change the category, the date and the note together', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);

      const response = await e2e
        .patch(`/transactions/${saved.id}`, user, {
          categoryId: await categoryId(user, 'Water'),
          occurredOn: '2025-10-01',
          note: '  Sept bill  ',
        })
        .expect(200);
      expect(response.body).toMatchObject({
        categoryName: 'Water',
        occurredOn: '2025-10-01',
        note: 'Sept bill',
      });
    });

    it('clears the note with an empty text or null', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);
      const empty = await e2e.patch(`/transactions/${saved.id}`, user, { note: '' }).expect(200);
      expect(empty.body.note).toBeNull();
      await e2e.patch(`/transactions/${saved.id}`, user, { note: 'again' }).expect(200);
      const cleared = await e2e
        .patch(`/transactions/${saved.id}`, user, { note: null })
        .expect(200);
      expect(cleared.body.note).toBeNull();
    });

    it('records when it was changed', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await e2e.patch(`/transactions/${saved.id}`, user, { amountMkd: 1 }).expect(200);

      const row = await e2e.prisma.transaction.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
    });

    it('refuses invalid changes with field messages, changing nothing', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['nothing to change', {}, 'form'],
        ['zero', { amountMkd: 0 }, 'amountMkd'],
        ['decimal', { amountMkd: 1.5 }, 'amountMkd'],
        ['too large', { amountMkd: 100_000_001 }, 'amountMkd'],
        ['impossible date', { occurredOn: '2025-02-30' }, 'occurredOn'],
        ['bad category id', { categoryId: 'nope' }, 'categoryId'],
        ['long note', { note: 'x'.repeat(201) }, 'note'],
        ['changing the kind', { kind: 'cash_withdrawal' }, 'form'],
        ['changing the owner', { userId: randomUUID() }, 'form'],
      ];
      for (const [label, body, field] of cases) {
        const response = await e2e.patch(`/transactions/${saved.id}`, user, body);
        expect(response.status, label).toBe(400);
        expect(Object.keys(errorOf(response.body).details ?? {}), label).toContain(field);
      }
      expect(await recent(user)).toEqual([saved]);
    });

    it('refuses a date in the future', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);
      const inDays = (n: number) =>
        new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

      await e2e.patch(`/transactions/${saved.id}`, user, { occurredOn: inDays(1) }).expect(200);
      const late = await e2e
        .patch(`/transactions/${saved.id}`, user, { occurredOn: inDays(3) })
        .expect(400);
      expect(errorOf(late.body).details).toEqual({ occurredOn: 'Date cannot be in the future' });
    });

    it('refuses a move to an archived category, but allows edits while the own category is archived', async () => {
      const user = await e2e.newUser();
      const saved = await addOne(user);
      const water = await categoryId(user, 'Water');
      const groceries = await categoryId(user, 'Groceries');
      await e2e.patch(`/categories/${water}`, user, { archived: true }).expect(200);

      const move = await e2e.patch(`/transactions/${saved.id}`, user, { categoryId: water });
      expect(move.status).toBe(409);
      expect(errorOf(move.body).code).toBe('CONFLICT');

      await e2e.patch(`/categories/${groceries}`, user, { archived: true }).expect(200);
      const edit = await e2e
        .patch(`/transactions/${saved.id}`, user, { categoryId: groceries, amountMkd: 777 })
        .expect(200);
      expect(edit.body).toMatchObject({ categoryName: 'Groceries', amountMkd: 777 });
    });

    it('answers "not found" for an unknown id and for an id that is not a UUID', async () => {
      const user = await e2e.newUser();
      await e2e.patch(`/transactions/${randomUUID()}`, user, { amountMkd: 1 }).expect(404);
      await e2e.patch('/transactions/not-a-uuid', user, { amountMkd: 1 }).expect(404);
    });

    it("cannot change another user's expense, or move one into another user's category", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = await addOne(alice);
      const bobsCategory = await categoryId(bob, 'Groceries');

      const foreign = await e2e.patch(`/transactions/${saved.id}`, bob, { amountMkd: 1 });
      expect(foreign.status).toBe(404);
      expect(errorOf(foreign.body).code).toBe('NOT_FOUND');
      expect(await recent(alice)).toEqual([saved]);

      const mine = await addOne(bob);
      const alicesCategory = await categoryId(alice, 'Groceries');
      await e2e.patch(`/transactions/${mine.id}`, bob, { categoryId: alicesCategory }).expect(404);
      expect((await recent(bob))[0]!.categoryId).toBe(bobsCategory);
    });

    it("is enforced by the database: an edit cannot point at another user's category", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = await addOne(alice);
      const bobsCategory = await categoryId(bob, 'Groceries');

      await expect(
        e2e.prisma.transaction.update({
          where: { id: saved.id },
          data: { categoryId: bobsCategory },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });
  });

  describe('deleting an expense', () => {
    it('removes exactly that one', async () => {
      const user = await e2e.newUser();
      const first = (await add(user, 'Groceries', 1, '2025-11-01')).body as TransactionResponse;
      const second = (await add(user, 'Groceries', 2, '2025-11-02')).body as TransactionResponse;
      const third = (await add(user, 'Groceries', 3, '2025-11-03')).body as TransactionResponse;

      const response = await e2e.delete(`/transactions/${second.id}`, user).expect(204);
      expect(response.text).toBe('');
      expect((await recent(user)).map((t) => t.id)).toEqual([third.id, first.id]);
    });

    it('answers "not found" the second time, for an unknown id and for a non-UUID', async () => {
      const user = await e2e.newUser();
      const saved = (await add(user, 'Groceries', 1)).body as TransactionResponse;
      await e2e.delete(`/transactions/${saved.id}`, user).expect(204);
      await e2e.delete(`/transactions/${saved.id}`, user).expect(404);
      await e2e.delete(`/transactions/${randomUUID()}`, user).expect(404);
      await e2e.delete('/transactions/not-a-uuid', user).expect(404);
    });

    it("cannot delete another user's expense, which stays", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = (await add(alice, 'Groceries', 1)).body as TransactionResponse;

      await e2e.delete(`/transactions/${saved.id}`, bob).expect(404);
      expect(await recent(alice)).toEqual([saved]);
    });

    it('needs a login', async () => {
      const user = await e2e.newUser();
      const saved = (await add(user, 'Groceries', 1)).body as TransactionResponse;
      await e2e.http().delete(`/api/v1/transactions/${saved.id}`).expect(401);
      await e2e.http().patch(`/api/v1/transactions/${saved.id}`).send({ amountMkd: 2 }).expect(401);
      expect(await recent(user)).toEqual([saved]);
    });
  });

  // The service checks ownership first, which could hide a broken filter in the repository.
  // These tests call the repository directly, so each layer has to hold on its own.
  describe('the repository on its own', () => {
    const repository = () => e2e.app.get<TransactionsRepository>(TRANSACTIONS_REPOSITORY);

    it("never reads, changes or deletes another user's transaction", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = (await add(alice, 'Groceries', 450, '2025-11-07', 'Vero'))
        .body as TransactionResponse;
      const repo = repository();

      expect(await repo.find(bob.id, saved.id)).toBeNull();
      expect(await repo.update(bob.id, saved.id, { amountMkd: 1 })).toBeNull();
      expect(await repo.delete(bob.id, saved.id)).toBe(false);
      expect(await repo.listRecent(bob.id, 50)).toEqual([]);
      expect(await repo.listMonth(bob.id, '2025-11')).toEqual([]);
      expect(await repo.listMonth(bob.id, '2025-11', saved.categoryId)).toEqual([]);

      // ...and nothing happened to the owner's row.
      expect(await repo.find(alice.id, saved.id)).toEqual(saved);
    });

    it('does work for the owner', async () => {
      const alice = await e2e.newUser();
      const saved = (await add(alice, 'Groceries', 450, '2025-11-07')).body as TransactionResponse;
      const repo = repository();

      expect(await repo.update(alice.id, saved.id, { amountMkd: 5, note: 'x' })).toMatchObject({
        amountMkd: 5,
        note: 'x',
      });
      expect(await repo.delete(alice.id, saved.id)).toBe(true);
      expect(await repo.find(alice.id, saved.id)).toBeNull();
    });
  });
});
