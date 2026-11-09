import type { CategoriesResponse, MonthSummaryResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('summary', () => {
  const e2e = new E2eHarness('@summary-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  async function categoryId(user: E2eUser, name: string): Promise<string> {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    const found = groups.flatMap((g) => g.categories).find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  }

  async function spend(
    user: E2eUser,
    amountMkd: number,
    occurredOn: string,
    category = 'Groceries',
    kind?: 'cash_withdrawal',
  ): Promise<string> {
    const response = await e2e
      .post('/transactions', user, {
        categoryId: await categoryId(user, category),
        amountMkd,
        occurredOn,
        ...(kind ? { kind } : {}),
      })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  const salary = async (user: E2eUser, over: Record<string, unknown> = {}) =>
    (
      await e2e
        .post('/income', user, {
          recurrence: 'monthly',
          name: 'Salary',
          amountMkd: 100_000,
          startMonth: '2026-01',
          payDay: 25,
          ...over,
        })
        .expect(201)
    ).body as { id: string };

  const bonus = async (user: E2eUser, amountMkd: number, receivedOn: string) =>
    e2e
      .post('/income', user, { recurrence: 'one_off', name: 'Bonus', amountMkd, receivedOn })
      .expect(201);

  const summary = async (user: E2eUser, month: string): Promise<MonthSummaryResponse> =>
    (await e2e.get(`/summary?month=${month}`, user).expect(200)).body as MonthSummaryResponse;

  describe('login and the month', () => {
    it('needs a login', async () => {
      await e2e.http().get('/api/v1/summary?month=2026-11').expect(401);
    });

    it('needs a valid month, and says which field is wrong', async () => {
      const user = await e2e.newUser();
      for (const query of [
        '',
        '?month=',
        '?month=2026-13',
        '?month=2026-1',
        '?month=2026',
        '?month=nov',
        '?month=2026-11-01',
        '?month=1999-12',
        '?month=2026-11&month=2026-12',
      ]) {
        const response = await e2e.get(`/summary${query}`, user);
        expect(response.status, query).toBe(400);
        expect(errorOf(response.body).code, query).toBe('VALIDATION_FAILED');
        expect(Object.keys(errorOf(response.body).details ?? {}), query).toEqual(['month']);
      }
    });
  });

  describe('the totals', () => {
    it('are zero, with no savings rate, for a user with nothing', async () => {
      const user = await e2e.newUser();
      expect(await summary(user, '2026-11')).toEqual({
        month: '2026-11',
        incomeMkd: 0,
        expensesMkd: 0,
        netMkd: 0,
        savingsRate: null,
      });
    });

    it('match Budget.xlsx January 2025 (income 146,308, tracked expenses 82,272)', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 146_308, startMonth: '2024-06', payDay: 25 });
      await spend(user, 40_000, '2025-01-05', 'Water');
      await spend(user, 25_000, '2025-01-12', 'Groceries');
      await spend(user, 10_000, '2025-01-20', 'Restaurants');
      await spend(user, 7_272, '2025-01-31', 'Cash withdrawal', 'cash_withdrawal');
      // Outside the month: neither the day before nor the day after counts.
      await spend(user, 999, '2024-12-31');
      await spend(user, 888, '2025-02-01');
      await bonus(user, 5_000, '2025-02-10');

      const result = await summary(user, '2025-01');
      expect(result).toMatchObject({
        month: '2025-01',
        incomeMkd: 146_308,
        expensesMkd: 82_272,
        netMkd: 64_036,
      });
      expect(result.savingsRate).toBeCloseTo(0.4377, 4);
    });

    it('add up salary, one-off income and every kind of spending of the month', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 100_000 });
      await salary(user, { name: 'Side job', amountMkd: 20_000, startMonth: '2026-11' });
      await bonus(user, 5_000, '2026-11-03');
      await bonus(user, 700, '2026-11-30');
      await bonus(user, 99, '2026-12-01');
      await spend(user, 30_000, '2026-11-02');
      await spend(user, 10_000, '2026-11-04', 'Cash withdrawal', 'cash_withdrawal');

      expect(await summary(user, '2026-11')).toEqual({
        month: '2026-11',
        incomeMkd: 125_700,
        expensesMkd: 40_000,
        netMkd: 85_700,
        savingsRate: 85_700 / 125_700,
      });
      expect((await summary(user, '2026-12')).incomeMkd).toBe(120_099);
    });

    it('count a salary only while it runs, also across a raise', async () => {
      const user = await e2e.newUser();
      const old = await salary(user, { amountMkd: 100_000, startMonth: '2026-01' });
      await e2e.patch(`/income/${old.id}`, user, { endMonth: '2026-05' }).expect(200);
      await salary(user, { amountMkd: 120_000, startMonth: '2026-06' });

      expect((await summary(user, '2025-12')).incomeMkd).toBe(0);
      expect((await summary(user, '2026-01')).incomeMkd).toBe(100_000);
      expect((await summary(user, '2026-05')).incomeMkd).toBe(100_000);
      expect((await summary(user, '2026-06')).incomeMkd).toBe(120_000);
      expect((await summary(user, '2030-01')).incomeMkd).toBe(120_000);
    });

    it('have no savings rate when only money went out, and a negative one when overspent', async () => {
      const user = await e2e.newUser();
      await spend(user, 4_000, '2026-03-10');
      expect(await summary(user, '2026-03')).toMatchObject({
        incomeMkd: 0,
        expensesMkd: 4_000,
        netMkd: -4_000,
        savingsRate: null,
      });
      await bonus(user, 10_000, '2026-04-02');
      await spend(user, 12_500, '2026-04-10');
      const april = await summary(user, '2026-04');
      expect(april.netMkd).toBe(-2_500);
      expect(april.savingsRate).toBe(-0.25);
    });

    it('follow edits and deletes', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 100_000 });
      const first = await spend(user, 30_000, '2026-11-02');
      const second = await spend(user, 20_000, '2026-11-03');
      expect((await summary(user, '2026-11')).expensesMkd).toBe(50_000);

      await e2e.patch(`/transactions/${first}`, user, { amountMkd: 35_000 }).expect(200);
      expect((await summary(user, '2026-11')).expensesMkd).toBe(55_000);
      await e2e.patch(`/transactions/${second}`, user, { occurredOn: '2026-10-01' }).expect(200);
      expect((await summary(user, '2026-11')).expensesMkd).toBe(35_000);
      expect((await summary(user, '2026-10')).expensesMkd).toBe(20_000);
      await e2e.delete(`/transactions/${first}`, user).expect(204);
      expect((await summary(user, '2026-11')).expensesMkd).toBe(0);
    });

    it('add up past the size of a 32-bit number without overflow', async () => {
      const user = await e2e.newUser();
      for (let i = 0; i < 25; i++) await spend(user, 100_000_000, '2026-11-02');
      expect((await summary(user, '2026-11')).expensesMkd).toBe(2_500_000_000);
    });
  });

  describe('ownership', () => {
    it("never mix in another user's income or expenses", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await salary(alice, { amountMkd: 111 });
      await spend(alice, 11, '2026-11-05');
      await salary(bob, { amountMkd: 222_000 });
      await bonus(bob, 5, '2026-11-02');
      await spend(bob, 22_000, '2026-11-05');

      expect(await summary(alice, '2026-11')).toMatchObject({ incomeMkd: 111, expensesMkd: 11 });
      expect(await summary(bob, '2026-11')).toMatchObject({
        incomeMkd: 222_005,
        expensesMkd: 22_000,
      });
    });

    // The service sums through the repository; this calls it directly, so its own
    // userId filter has to hold on its own.
    it("the expense total of the repository only counts the user's own rows", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await spend(alice, 1_000, '2026-11-05');
      await spend(bob, 70_000, '2026-11-05');
      const repo = e2e.app.get<TransactionsRepository>(TRANSACTIONS_REPOSITORY);

      expect(await repo.sumMonth(alice.id, '2026-11')).toBe(1_000);
      expect(await repo.sumMonth(bob.id, '2026-11')).toBe(70_000);
      expect(await repo.sumMonth(alice.id, '2026-10')).toBe(0);
      const stranger = await e2e.newUser();
      expect(await repo.sumMonth(stranger.id, '2026-11')).toBe(0);
    });
  });
});
