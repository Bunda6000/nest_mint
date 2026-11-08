import type {
  CategoriesResponse,
  TransactionResponse,
  TransactionsResponse,
} from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

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
});
