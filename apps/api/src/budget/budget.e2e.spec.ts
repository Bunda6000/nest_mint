import type {
  BillsResponse,
  BudgetGridResponse,
  CategoriesResponse,
  ObligationResponse,
} from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

const now = new Date();
const THIS = now.toISOString().slice(0, 7);
const YEAR = Number(THIS.slice(0, 4));
const THIS_INDEX = Number(THIS.slice(5, 7)) - 1;
/** Transactions cannot be dated in the future, so everything but the bill test uses last year. */
const PAST = YEAR - 1;

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('budget grid', () => {
  const e2e = new E2eHarness('@budget-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  async function category(user: E2eUser, name: string) {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    for (const group of groups) {
      const found = group.categories.find((c) => c.name === name);
      if (found) return { id: found.id, groupId: group.id };
    }
    throw new Error(`No category ${name}`);
  }

  const spend = async (
    user: E2eUser,
    name: string,
    amountMkd: number,
    occurredOn: string,
    kind?: 'cash_withdrawal',
  ) =>
    e2e
      .post('/transactions', user, {
        categoryId: (await category(user, name)).id,
        amountMkd,
        occurredOn,
        ...(kind ? { kind } : {}),
      })
      .expect(201);

  const grid = async (user: E2eUser, year = PAST) =>
    (await e2e.get(`/budget?year=${year}`, user).expect(200)).body as BudgetGridResponse;
  const row = (g: BudgetGridResponse, name: string) => g.groups.find((r) => r.groupName === name)!;

  it('needs a login', async () => {
    await e2e.http().get(`/api/v1/budget?year=${PAST}`).expect(401);
  });

  it('needs a valid year, and says which field is wrong', async () => {
    const user = await e2e.newUser();
    for (const query of ['', '?year=', '?year=abc', '?year=1999', '?year=20260', '?year=26']) {
      const response = await e2e.get(`/budget${query}`, user).expect(400);
      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
      expect(errorOf(response.body).details).toHaveProperty('year');
    }
  });

  it('gives a new user the default groups and an empty year', async () => {
    const user = await e2e.newUser();
    await e2e.get('/categories', user).expect(200); // creates the default categories
    const g = await grid(user);
    expect(g.months).toHaveLength(12);
    expect(g.groups.length).toBeGreaterThanOrEqual(7);
    expect(g.groups.map((r) => r.groupName).slice(0, 3)).toEqual(['Banks', 'Home', 'Child']);
    expect(g.expensesTotal).toEqual({ plannedMkd: null, actualMkd: 0 });
    expect(g.incomeTotalMkd).toBe(0);
    expect(g.savingsRateTotal).toBeNull();
  });

  it('adds actual spending per group and month, cash withdrawals included, with totals', async () => {
    const user = await e2e.newUser();
    await e2e.get('/categories', user).expect(200);
    await spend(user, 'Electricity', 3_460, `${PAST}-01-12`);
    await spend(user, 'Water', 705, `${PAST}-01-20`);
    await spend(user, 'Electricity', 4_881, `${PAST}-02-03`);
    await spend(user, 'Cash withdrawal', 1_900, `${PAST}-01-05`, 'cash_withdrawal');
    await spend(user, 'Electricity', 77, `${PAST - 1}-12-31`);
    await spend(user, 'Electricity', 88, `${PAST + 1}-01-01`);
    const g = await grid(user);
    expect(row(g, 'Home').months[0]!.actualMkd).toBe(4_165);
    expect(row(g, 'Home').months[1]!.actualMkd).toBe(4_881);
    expect(row(g, 'Home').total.actualMkd).toBe(9_046);
    expect(row(g, 'Banks').months[0]!.actualMkd).toBe(1_900);
    expect(g.expenses[0]!.actualMkd).toBe(6_065);
    expect(g.expensesTotal.actualMkd).toBe(10_946);
    const byRows = g.groups.reduce((sum, r) => sum + r.total.actualMkd, 0);
    expect(byRows).toBe(g.expensesTotal.actualMkd);
  });

  it('works out income, net and savings rate', async () => {
    const user = await e2e.newUser();
    await e2e.get('/categories', user).expect(200);
    await e2e
      .post('/income', user, {
        recurrence: 'monthly',
        name: 'Salary',
        amountMkd: 100_000,
        startMonth: `${PAST}-01`,
        payDay: 25,
      })
      .expect(201);
    await spend(user, 'Electricity', 25_000, `${PAST}-03-10`);
    const g = await grid(user);
    expect(g.incomeTotalMkd).toBe(1_200_000);
    expect(g.netMkd[2]).toBe(75_000);
    expect(g.savingsRate[2]).toBeCloseTo(0.75);
    expect(g.netTotalMkd).toBe(1_200_000 - 25_000);
  });

  it("plans from bills' expected amounts, and a payment becomes the actual", async () => {
    const user = await e2e.newUser();
    const electricity = await category(user, 'Electricity');
    const obligation = (
      await e2e
        .post('/obligations', user, {
          recurrence: 'monthly',
          name: 'Electricity',
          payee: 'EVN',
          categoryId: electricity.id,
          expectedAmountMkd: 4_500,
          dueDay: 15,
          startMonth: `${YEAR}-01`,
        })
        .expect(201)
    ).body as ObligationResponse;
    await e2e.post(`/bills/generate?month=${THIS}`, user, {}).expect(200);

    let g = await grid(user, YEAR);
    expect(row(g, 'Home').months[THIS_INDEX]).toEqual({ plannedMkd: 4_500, actualMkd: 0 });
    expect(row(g, 'Banks').total.plannedMkd).toBeNull();

    const bill = (
      (await e2e.get(`/bills?month=${THIS}`, user).expect(200)).body as BillsResponse
    ).bills.find((b) => b.obligationId === obligation.id)!;
    await e2e.post('/bills/pay', user, { billIds: [bill.id], paidOn: `${THIS}-01` }).expect(200);

    g = await grid(user, YEAR);
    expect(row(g, 'Home').months[THIS_INDEX]).toEqual({ plannedMkd: 4_500, actualMkd: 4_500 });
  });

  it("never shows another user's amounts", async () => {
    const a = await e2e.newUser();
    const b = await e2e.newUser();
    await e2e.get('/categories', a).expect(200);
    await e2e.get('/categories', b).expect(200);
    await spend(a, 'Electricity', 1_234, `${PAST}-05-05`);
    await e2e
      .post('/income', a, {
        recurrence: 'monthly',
        name: 'Salary',
        amountMkd: 50_000,
        startMonth: `${PAST}-01`,
        payDay: 1,
      })
      .expect(201);
    const forB = await grid(b);
    expect(forB.expensesTotal.actualMkd).toBe(0);
    expect(forB.incomeTotalMkd).toBe(0);
    expect((await grid(a)).expensesTotal.actualMkd).toBe(1_234);
  });

  it('keeps an archived group that has amounts and leaves out one that has none', async () => {
    const user = await e2e.newUser();
    await e2e.get('/categories', user).expect(200);
    await spend(user, 'Electricity', 500, `${PAST}-05-05`);
    const home = (await category(user, 'Electricity')).groupId;
    const child = (await category(user, 'Kindergarten')).groupId;
    await e2e.patch(`/categories/groups/${home}`, user, { archived: true }).expect(200);
    await e2e.patch(`/categories/groups/${child}`, user, { archived: true }).expect(200);
    const names = (await grid(user)).groups.map((r) => r.groupName);
    expect(names).toContain('Home');
    expect(names).not.toContain('Child');
  });
});
