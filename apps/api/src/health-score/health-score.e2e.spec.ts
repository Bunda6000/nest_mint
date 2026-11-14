import type { CategoriesResponse, HealthScoreResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('health score', () => {
  const e2e = new E2eHarness('@health-score-test.example');
  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('needs a login', async () => {
    await e2e.http().get('/api/v1/health-score').expect(401);
  });

  it('has no score for a user without income', async () => {
    const user = await e2e.newUser();
    const body = (await e2e.get('/health-score', user).expect(200)).body as HealthScoreResponse;
    expect(body).toMatchObject({ score: null, label: null, factors: [], months: [] });
  });

  it('scores a user from their own income, spending and goals', async () => {
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
    const { groups } = (await e2e.get('/categories', user).expect(200)).body as CategoriesResponse;
    const groceries = groups.flatMap((g) => g.categories).find((c) => c.name === 'Groceries')!;
    await e2e
      .post('/transactions', user, {
        categoryId: groceries.id,
        amountMkd: 10_000,
        occurredOn: new Date().toISOString().slice(0, 10),
      })
      .expect(201);
    await e2e
      .post('/goals', user, {
        kind: 'monthly',
        name: 'Rainy day',
        monthlyMkd: 5_000,
        startingMkd: 50_000,
      })
      .expect(201);

    const body = (await e2e.get('/health-score', user).expect(200)).body as HealthScoreResponse;
    expect(body.score).not.toBeNull();
    expect(body.months).toHaveLength(6);
    expect(body.factors.map((f) => f.key)).toContain('savings_rate');
    expect(body.factors.reduce((t, f) => t + f.weight, 0)).toBe(100);

    // Another user sees none of this.
    const other = await e2e.newUser();
    expect(
      ((await e2e.get('/health-score', other).expect(200)).body as HealthScoreResponse).score,
    ).toBeNull();
  });
});
