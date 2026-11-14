import type {
  CategoriesResponse,
  HistoryResponse,
  MonthBreakdownResponse,
  MonthSummaryResponse,
  SavingsIdeasResponse,
} from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('insights', () => {
  const e2e = new E2eHarness('@insights-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  async function category(user: E2eUser, name: string) {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    for (const group of groups) {
      const found = group.categories.find((c) => c.name === name);
      if (found) return { id: found.id, name, groupId: group.id, groupName: group.name };
    }
    throw new Error(`No category ${name}`);
  }

  async function spend(
    user: E2eUser,
    amountMkd: number,
    occurredOn: string,
    name = 'Groceries',
    kind?: 'cash_withdrawal',
  ): Promise<string> {
    const response = await e2e
      .post('/transactions', user, {
        categoryId: (await category(user, name)).id,
        amountMkd,
        occurredOn,
        ...(kind ? { kind } : {}),
      })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  const salary = (user: E2eUser, over: Record<string, unknown> = {}) =>
    e2e
      .post('/income', user, {
        recurrence: 'monthly',
        name: 'Salary',
        amountMkd: 100_000,
        startMonth: '2026-01',
        payDay: 25,
        ...over,
      })
      .expect(201);

  const breakdown = async (user: E2eUser, month: string) =>
    (await e2e.get(`/insights/breakdown?month=${month}`, user).expect(200))
      .body as MonthBreakdownResponse;

  const history = async (user: E2eUser, month: string) =>
    (await e2e.get(`/insights/history?month=${month}`, user).expect(200)).body as HistoryResponse;

  describe.each(['breakdown', 'history'])('%s: login and the month', (endpoint) => {
    it('needs a login', async () => {
      await e2e.http().get(`/api/v1/insights/${endpoint}?month=2026-06`).expect(401);
    });

    it('needs a valid month, and says which field is wrong', async () => {
      const user = await e2e.newUser();
      for (const query of [
        '',
        '?month=',
        '?month=2026-13',
        '?month=2026-1',
        '?month=2026',
        '?month=1999-12',
      ]) {
        const response = await e2e.get(`/insights/${endpoint}${query}`, user).expect(400);
        expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
        expect(errorOf(response.body).details).toHaveProperty('month');
      }
    });
  });

  describe('breakdown', () => {
    it('totals each category with its group, biggest first, and lists the biggest transactions', async () => {
      const user = await e2e.newUser();
      await spend(user, 5_000, '2026-06-02', 'Groceries');
      await spend(user, 3_000, '2026-06-09', 'Groceries');
      await spend(user, 1_500, '2026-06-20', 'Restaurants');
      await spend(user, 20_000, '2026-06-01', 'Mortgage');
      const groceries = await category(user, 'Groceries');
      const restaurants = await category(user, 'Restaurants');
      const mortgage = await category(user, 'Mortgage');

      const result = await breakdown(user, '2026-06');
      expect(result.month).toBe('2026-06');
      expect(result.categories).toEqual([
        {
          categoryId: mortgage.id,
          categoryName: 'Mortgage',
          groupId: mortgage.groupId,
          groupName: mortgage.groupName,
          amountMkd: 20_000,
        },
        {
          categoryId: groceries.id,
          categoryName: 'Groceries',
          groupId: groceries.groupId,
          groupName: groceries.groupName,
          amountMkd: 8_000,
        },
        {
          categoryId: restaurants.id,
          categoryName: 'Restaurants',
          groupId: restaurants.groupId,
          groupName: restaurants.groupName,
          amountMkd: 1_500,
        },
      ]);
      expect(result.top.map((t) => [t.amountMkd, t.categoryName])).toEqual([
        [20_000, 'Mortgage'],
        [5_000, 'Groceries'],
        [3_000, 'Groceries'],
        [1_500, 'Restaurants'],
      ]);
    });

    it("counts cash withdrawals, so it adds up to the month's expenses in /summary", async () => {
      const user = await e2e.newUser();
      await salary(user);
      await spend(user, 5_000, '2026-06-02');
      await spend(user, 10_000, '2026-06-03', 'Mortgage', 'cash_withdrawal');

      const result = await breakdown(user, '2026-06');
      const summary = (await e2e.get('/summary?month=2026-06', user).expect(200))
        .body as MonthSummaryResponse;
      expect(result.categories.reduce((t, c) => t + c.amountMkd, 0)).toBe(summary.expensesMkd);
      expect(result.top[0]).toMatchObject({ amountMkd: 10_000, kind: 'cash_withdrawal' });
    });

    it('only counts the month asked for, first and last day included', async () => {
      const user = await e2e.newUser();
      await spend(user, 100, '2026-05-31');
      await spend(user, 200, '2026-06-01');
      await spend(user, 400, '2026-06-30');
      await spend(user, 800, '2026-07-01');
      const result = await breakdown(user, '2026-06');
      expect(result.categories.map((c) => c.amountMkd)).toEqual([600]);
      expect(result.top.map((t) => t.amountMkd)).toEqual([400, 200]);
    });

    it('lists at most five transactions, biggest first, newest first on a tie', async () => {
      const user = await e2e.newUser();
      for (const [amount, day] of [
        [1_000, '01'],
        [9_000, '02'],
        [5_000, '03'],
        [5_000, '04'],
        [7_000, '05'],
        [300, '06'],
        [4_000, '07'],
      ] as const) {
        await spend(user, amount, `2026-06-${day}`);
      }
      const { top } = await breakdown(user, '2026-06');
      expect(top.map((t) => [t.amountMkd, t.occurredOn])).toEqual([
        [9_000, '2026-06-02'],
        [7_000, '2026-06-05'],
        [5_000, '2026-06-04'],
        [5_000, '2026-06-03'],
        [4_000, '2026-06-07'],
      ]);
    });

    it('puts the one entered last first when amount and day are the same', async () => {
      const user = await e2e.newUser();
      const categoryId = (await category(user, 'Groceries')).id;
      for (const note of ['first', 'second', 'third']) {
        await e2e
          .post('/transactions', user, {
            categoryId,
            amountMkd: 5_000,
            occurredOn: '2026-06-10',
            note,
          })
          .expect(201);
      }
      const { top } = await breakdown(user, '2026-06');
      expect(top.map((t) => t.note)).toEqual(['third', 'second', 'first']);
    });

    it('is empty for a month with nothing in it', async () => {
      const user = await e2e.newUser();
      expect(await breakdown(user, '2026-06')).toEqual({
        month: '2026-06',
        categories: [],
        top: [],
      });
    });

    it('follows edits and deletes', async () => {
      const user = await e2e.newUser();
      const id = await spend(user, 5_000, '2026-06-02');
      await e2e.patch(`/transactions/${id}`, user, { amountMkd: 9_000 }).expect(200);
      expect((await breakdown(user, '2026-06')).categories[0]!.amountMkd).toBe(9_000);
      await e2e.delete(`/transactions/${id}`, user).expect(204);
      expect(await breakdown(user, '2026-06')).toEqual({
        month: '2026-06',
        categories: [],
        top: [],
      });
    });

    it("never shows another user's spending", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      await spend(b, 99_999, '2026-06-02', 'Mortgage');
      await spend(a, 100, '2026-06-02');
      const result = await breakdown(a, '2026-06');
      expect(result.categories.map((c) => c.amountMkd)).toEqual([100]);
      expect(result.top.map((t) => t.amountMkd)).toEqual([100]);
    });
  });

  describe('history', () => {
    it('covers twelve months ending at the one asked for, oldest first', async () => {
      const user = await e2e.newUser();
      const { months } = await history(user, '2026-06');
      expect(months).toHaveLength(12);
      expect(months[0]!.month).toBe('2025-07');
      expect(months[11]!.month).toBe('2026-06');
    });

    it('gives income, expenses, net, running total and savings rate per month', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 100_000, startMonth: '2026-04' });
      await spend(user, 60_000, '2026-04-10');
      await spend(user, 120_000, '2026-05-10');
      await spend(user, 40_000, '2026-06-10');

      const { months } = await history(user, '2026-06');
      const last3 = months.slice(-3);
      expect(last3.map((m) => m.incomeMkd)).toEqual([100_000, 100_000, 100_000]);
      expect(last3.map((m) => m.expensesMkd)).toEqual([60_000, 120_000, 40_000]);
      expect(last3.map((m) => m.netMkd)).toEqual([40_000, -20_000, 60_000]);
      expect(last3.map((m) => m.cumulativeNetMkd)).toEqual([40_000, 20_000, 80_000]);
      expect(last3[1]!.savingsRate).toBeCloseTo(-0.2, 10);
      expect(months[0]).toMatchObject({ incomeMkd: 0, expensesMkd: 0, savingsRate: null });
    });

    it('agrees with /summary for every one of the twelve months', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 80_000, startMonth: '2025-09', endMonth: '2026-03' });
      await e2e
        .post('/income', user, {
          recurrence: 'one_off',
          name: 'Bonus',
          amountMkd: 25_000,
          receivedOn: '2025-12-31',
        })
        .expect(201);
      for (const [day, amount] of [
        ['2025-07-01', 700],
        ['2026-01-31', 800],
        ['2026-02-01', 900],
        ['2026-05-31', 1_100],
        ['2026-06-15', 1_200],
        ['2026-06-30', 1_300],
      ] as const) {
        await spend(user, amount, day);
      }
      await spend(user, 5_000, '2026-04-04', 'Mortgage', 'cash_withdrawal');

      const { months } = await history(user, '2026-06');
      for (const m of months) {
        const summary = (await e2e.get(`/summary?month=${m.month}`, user).expect(200))
          .body as MonthSummaryResponse;
        expect({
          month: m.month,
          i: m.incomeMkd,
          e: m.expensesMkd,
          n: m.netMkd,
          r: m.savingsRate,
        }).toEqual({
          month: summary.month,
          i: summary.incomeMkd,
          e: summary.expensesMkd,
          n: summary.netMkd,
          r: summary.savingsRate,
        });
      }
      expect(months.at(-1)!.cumulativeNetMkd).toBe(months.reduce((t, m) => t + m.netMkd, 0));
    });

    it('ignores spending outside the twelve months and includes both ends', async () => {
      const user = await e2e.newUser();
      await spend(user, 77_000, '2025-06-30');
      await spend(user, 88_000, '2026-07-01');
      await spend(user, 1_000, '2025-07-01');
      await spend(user, 2_000, '2026-06-30');
      const { months } = await history(user, '2026-06');
      expect(months[0]!.expensesMkd).toBe(1_000);
      expect(months[11]!.expensesMkd).toBe(2_000);
      expect(months.reduce((t, m) => t + m.expensesMkd, 0)).toBe(3_000);
    });

    it('matches Budget.xlsx January 2025 (income 146,308, expenses 82,272)', async () => {
      const user = await e2e.newUser();
      await salary(user, { amountMkd: 146_308, startMonth: '2024-06' });
      for (const amount of [40_000, 25_000, 10_000, 7_272]) await spend(user, amount, '2025-01-15');
      const january = (await history(user, '2025-01')).months[11]!;
      expect(january).toMatchObject({
        month: '2025-01',
        incomeMkd: 146_308,
        expensesMkd: 82_272,
        netMkd: 64_036,
      });
      expect(january.savingsRate).toBeCloseTo(0.4377, 4);
    });

    it("never shows another user's income or spending", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      await salary(b, { amountMkd: 999_999 });
      await spend(b, 500_000, '2026-06-02');
      await salary(a, { amountMkd: 50_000, startMonth: '2026-06' });
      const june = (await history(a, '2026-06')).months[11]!;
      expect(june).toMatchObject({ incomeMkd: 50_000, expensesMkd: 0 });
    });
  });

  describe('savings ideas', () => {
    it('needs a login and a month', async () => {
      await e2e.http().get('/api/v1/insights/ideas?month=2026-11').expect(401);
      const user = await e2e.newUser();
      await e2e.get('/insights/ideas', user).expect(400);
    });

    it("suggests a trim from the user's own past spending, with its calculation", async () => {
      const user = await e2e.newUser();
      await spend(user, 10_000, '2026-09-10', 'Restaurants');
      await spend(user, 10_000, '2026-10-10', 'Restaurants');
      const body = (await e2e.get('/insights/ideas?month=2026-11', user).expect(200))
        .body as SavingsIdeasResponse;
      expect(body.months).toEqual(['2026-09', '2026-10']);
      const trim = body.ideas.find((i) => i.kind === 'trim')!;
      expect(trim).toMatchObject({ categoryName: 'Restaurants', monthlyImpactMkd: 1_500 });
      expect(trim.method).toContain('15% of 10,000 = 1,500');
      expect(body.totalYearlyMkd).toBe(body.totalMonthlyMkd * 12);

      const other = await e2e.newUser();
      const empty = (await e2e.get('/insights/ideas?month=2026-11', other).expect(200))
        .body as SavingsIdeasResponse;
      expect(empty).toMatchObject({ ideas: [], months: [] });
    });
  });
});
