import type {
  CategoriesResponse,
  ForecastResponse,
  GoalResponse,
  ScenarioResponse,
} from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness, type E2eUser } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('forecast and what-if', () => {
  const e2e = new E2eHarness('@forecast-test.example');
  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const lastMonthDay = () => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  };

  async function categoryId(user: E2eUser, name: string): Promise<string> {
    const { groups } = (await e2e.get('/categories', user).expect(200)).body as CategoriesResponse;
    return groups.flatMap((g) => g.categories).find((c) => c.name === name)!.id;
  }

  /** Salary 100,000; last month: 30,000 on groceries, 10,000 on restaurants. */
  async function userWithHistory(): Promise<{ user: E2eUser; restaurants: string }> {
    const user = await e2e.newUser();
    await e2e
      .post('/income', user, {
        recurrence: 'monthly',
        name: 'Salary',
        amountMkd: 100_000,
        startMonth: '2020-01',
        payDay: 1,
      })
      .expect(201);
    const restaurants = await categoryId(user, 'Restaurants');
    for (const [categoryName, amountMkd] of [
      ['Groceries', 30_000],
      ['Restaurants', 10_000],
    ] as const) {
      await e2e
        .post('/transactions', user, {
          categoryId: await categoryId(user, categoryName),
          amountMkd,
          occurredOn: lastMonthDay(),
        })
        .expect(201);
    }
    return { user, restaurants };
  }

  it('needs a login', async () => {
    await e2e.http().get('/api/v1/forecast').expect(401);
    await e2e.http().post('/api/v1/forecast/scenario').send({}).expect(401);
  });

  it('projects from the usual month and says what it stands on', async () => {
    const { user } = await userWithHistory();
    const body = (await e2e.get('/forecast?months=6', user).expect(200)).body as ForecastResponse;
    expect(body.usualExpensesMkd).toBe(40_000);
    expect(body.basedOnMonths).toHaveLength(1);
    expect(body.startingBalanceMkd).toBeNull();
    expect(body.forecast.months).toHaveLength(6);
    expect(body.forecast.months[0]).toMatchObject({
      incomeMkd: 100_000,
      expensesMkd: 40_000,
      netMkd: 60_000,
    });
    expect(body.forecast.totalNetMkd).toBe(360_000);
  });

  it('starts from the last balance check-in', async () => {
    const { user } = await userWithHistory();
    const month = lastMonthDay().slice(0, 7);
    await e2e
      .put(`/balance-check-ins/${month}`, user, {
        closingBalanceMkd: 200_000,
        openingBalanceMkd: 150_000,
      })
      .expect(200);
    const body = (await e2e.get('/forecast?months=3', user).expect(200)).body as ForecastResponse;
    expect(body.startingBalanceMkd).toBe(200_000);
    expect(body.startingBalanceFrom).toBe(month);
    expect(body.forecast.endBalanceMkd).toBe(200_000 + 3 * 60_000);
  });

  it('rejects a bad horizon', async () => {
    const user = await e2e.newUser();
    for (const months of ['0', '61', 'abc', '2.5']) {
      await e2e.get(`/forecast?months=${months}`, user).expect(400);
    }
  });

  it('works out "spend 3,000 less on restaurants" with goals and health score', async () => {
    const { user, restaurants } = await userWithHistory();
    const goal = (
      await e2e
        .post('/goals', user, { kind: 'target', name: 'Car', targetMkd: 100_000 })
        .expect(201)
    ).body as GoalResponse;

    const result = (
      await e2e
        .post('/forecast/scenario', user, {
          months: 12,
          cuts: [{ categoryId: restaurants, reduceMkd: 3_000 }],
        })
        .expect(200)
    ).body as ScenarioResponse;

    expect(result.cuts).toEqual([
      { categoryId: restaurants, categoryName: 'Restaurants', reduceMkd: 3_000, usualMkd: 10_000 },
    ]);
    expect(result.extraPerMonthMkd).toBe(3_000);
    expect(result.extraSavedMkd).toBe(36_000);
    expect(result.scenario.totalNetMkd - result.baseline.totalNetMkd).toBe(36_000);
    expect(result.goals.map((g) => g.goalId)).toEqual([goal.id]);
    expect(result.healthBefore.score).not.toBeNull();
    expect(result.healthAfter.score!).toBeGreaterThanOrEqual(result.healthBefore.score!);
  });

  it('applies income and spending changes together', async () => {
    const { user } = await userWithHistory();
    const result = (
      await e2e
        .post('/forecast/scenario', user, {
          months: 3,
          incomeChangePercent: 10,
          expenseChangeMkd: -5_000,
        })
        .expect(200)
    ).body as ScenarioResponse;
    expect(result.scenario.months[0]).toMatchObject({ incomeMkd: 110_000, expensesMkd: 35_000 });
    expect(result.extraPerMonthMkd).toBe(15_000);
  });

  it('refuses cuts bigger than the category costs, repeated, unknown or of other users', async () => {
    const { user, restaurants } = await userWithHistory();
    const other = await userWithHistory();
    const bad = [
      [{ categoryId: restaurants, reduceMkd: 10_001 }],
      [
        { categoryId: restaurants, reduceMkd: 1 },
        { categoryId: restaurants, reduceMkd: 1 },
      ],
      [{ categoryId: randomUUID(), reduceMkd: 1 }],
      [{ categoryId: other.restaurants, reduceMkd: 1 }],
    ];
    for (const cuts of bad) {
      await e2e.post('/forecast/scenario', user, { months: 3, cuts }).expect(400);
    }
    await e2e
      .post('/forecast/scenario', user, { months: 3, incomeChangePercent: -150 })
      .expect(400);
  });

  it('shows another user nothing of this user', async () => {
    await userWithHistory();
    const stranger = await e2e.newUser();
    const body = (await e2e.get('/forecast', stranger).expect(200)).body as ForecastResponse;
    expect(body.usualExpensesMkd).toBe(0);
    expect(body.forecast.totalIncomeMkd).toBe(0);
  });
});
