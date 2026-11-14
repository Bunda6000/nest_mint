import type { BillsResponse, CategoriesResponse, LedgerResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('obligation ledger', () => {
  const e2e = new E2eHarness('@ledger-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  async function electricity(user: E2eUser): Promise<{ id: string }> {
    const { groups } = (await e2e.get('/categories', user).expect(200)).body as CategoriesResponse;
    const categoryId = groups
      .flatMap((g) => g.categories)
      .find((c) => c.name === 'Electricity')!.id;
    return (
      await e2e
        .post('/obligations', user, {
          recurrence: 'monthly',
          name: 'Electricity',
          payee: 'EVN',
          categoryId,
          expectedAmountMkd: 4_500,
          dueDay: 15,
          startMonth: '2025-11',
        })
        .expect(201)
    ).body as { id: string };
  }

  async function bill(user: E2eUser, obligationId: string, month: string) {
    await e2e.post(`/bills/generate?month=${month}`, user, {}).expect(200);
    const { bills } = (await e2e.get(`/bills?month=${month}`, user).expect(200))
      .body as BillsResponse;
    return bills.find((b) => b.obligationId === obligationId)!;
  }

  it('refuses the endpoint without a login', async () => {
    await e2e
      .http()
      .get('/api/v1/obligations/3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f/ledger')
      .expect(401);
  });

  it('lists a year of bills with invoice, payment and totals', async () => {
    const user = await e2e.newUser();
    const { id } = await electricity(user);
    const december = await bill(user, id, '2025-12');
    const january = await bill(user, id, '2026-01');
    await e2e
      .patch(`/bills/${january.id}`, user, { actualAmountMkd: 5_000, invoiceRef: 'INV-1' })
      .expect(200);
    await e2e.post(`/bills/${january.id}/pay`, user, { paidOn: '2026-01-20' }).expect(200);

    const ledger = (await e2e.get(`/obligations/${id}/ledger?year=2026`, user).expect(200))
      .body as LedgerResponse;
    expect(ledger).toMatchObject({
      name: 'Electricity',
      payee: 'EVN',
      year: 2026,
      years: [2025, 2026],
      yearTotalMkd: 5_000,
      yearPaidMkd: 5_000,
      lifetimeMkd: 9_500,
    });
    expect(ledger.rows).toEqual([
      {
        billId: january.id,
        period: '2026-01',
        dueDate: '2026-01-15',
        invoiceRef: 'INV-1',
        amountMkd: 5_000,
        paidOn: '2026-01-20',
      },
    ]);
    expect(december.period).toBe('2025-12');
  });

  it('answers 400 for a bad year and 404 for another user’s obligation', async () => {
    const owner = await e2e.newUser();
    const other = await e2e.newUser();
    const { id } = await electricity(owner);
    const bad = await e2e.get(`/obligations/${id}/ledger?year=20x6`, owner).expect(400);
    expect(
      (bad.body as { error: { details: Record<string, string> } }).error.details,
    ).toHaveProperty('year');
    await e2e.get(`/obligations/${id}/ledger`, other).expect(404);
  });
});
