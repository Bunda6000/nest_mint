import type { BillsResponse, CategoriesResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

const SECRET = 'e2e-cron-secret-0123456789';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('monthly job', () => {
  const e2e = new E2eHarness('@jobs-test.example');

  beforeAll(async () => {
    process.env.CRON_SECRET = SECRET;
    await e2e.start();
  });
  afterAll(async () => {
    delete process.env.CRON_SECRET;
    await e2e.stop();
  });

  it('is closed without the secret', async () => {
    await e2e.http().get('/api/v1/jobs/monthly').expect(401);
    await e2e.http().get('/api/v1/jobs/monthly').set('Authorization', 'Bearer nope').expect(401);
  });

  it('creates missing bills for every user and never twice', async () => {
    const user = await e2e.newUser();
    const { groups } = (await e2e.get('/categories', user).expect(200)).body as CategoriesResponse;
    const categoryId = groups
      .flatMap((g) => g.categories)
      .find((c) => c.name === 'Electricity')!.id;
    await e2e
      .post('/obligations', user, {
        recurrence: 'monthly',
        name: 'Electricity',
        payee: 'EVN',
        categoryId,
        expectedAmountMkd: 4_500,
        dueDay: 15,
        startMonth: '2026-01',
      })
      .expect(201);

    const run = () =>
      e2e.http().get('/api/v1/jobs/monthly').set('Authorization', `Bearer ${SECRET}`).expect(200);
    const first = (await run()).body as {
      billsCreated: number;
      failed: number;
      tokensDeleted: number;
    };
    expect(first.tokensDeleted).toBeGreaterThanOrEqual(0);
    expect(first.failed).toBe(0);
    const again = (await run()).body as { billsCreated: number };
    expect(again.billsCreated).toBe(0);

    const month = new Date().toISOString().slice(0, 7);
    const { bills } = (await e2e.get(`/bills?month=${month}`, user).expect(200))
      .body as BillsResponse;
    expect(bills.filter((b) => b.obligationName === 'Electricity')).toHaveLength(1);
  });
});
