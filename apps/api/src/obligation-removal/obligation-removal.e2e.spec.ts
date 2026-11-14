import type {
  BillsResponse,
  CategoriesResponse,
  ObligationResponse,
  ObligationsResponse,
} from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

const ID = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('obligation removal', () => {
  const e2e = new E2eHarness('@obligation-removal-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  async function category(user: E2eUser, name: string): Promise<string> {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    for (const group of groups) {
      const found = group.categories.find((c) => c.name === name);
      if (found) return found.id;
    }
    throw new Error(`No category ${name}`);
  }

  const addLoan = async (user: E2eUser) =>
    (
      await e2e
        .post('/obligations/loans', user, {
          name: 'Mortgage',
          lender: 'Bank',
          loanType: 'housing',
          principalMkd: 100_000,
          annualRateBp: 600,
          categoryId: await category(user, 'Electricity'),
          dueDay: 5,
          startMonth: '2026-01',
          endMonth: '2026-12',
          monthlyPaymentMkd: 9_000,
        })
        .expect(201)
    ).body as ObligationResponse;

  const month = async (user: E2eUser, period: string) => {
    await e2e.post(`/bills/generate?month=${period}`, user, {}).expect(200);
    return ((await e2e.get(`/bills?month=${period}`, user).expect(200)).body as BillsResponse)
      .bills;
  };

  const names = async (user: E2eUser) =>
    ((await e2e.get('/obligations', user).expect(200)).body as ObligationsResponse).obligations;

  it('refuses both endpoints without a login', async () => {
    await e2e.http().delete(`/api/v1/obligations/${ID}`).expect(401);
    await e2e.http().post(`/api/v1/obligations/${ID}/archive`).send({}).expect(401);
  });

  it('deletes a loan without payments, with its unpaid bills and rate changes', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    await month(user, '2026-03');
    await e2e
      .post(`/obligations/${loan.id}/rate-changes`, user, {
        effectiveMonth: '2026-06',
        annualRateBp: 700,
        monthlyPaymentMkd: 9_500,
      })
      .expect(201);
    await e2e.delete(`/obligations/${loan.id}`, user).expect(204);
    expect(await names(user)).toEqual([]);
    expect(await e2e.prisma.bill.count({ where: { obligationId: loan.id } })).toBe(0);
    expect(await e2e.prisma.loanRateChange.count({ where: { obligationId: loan.id } })).toBe(0);
    await e2e.delete(`/obligations/${loan.id}`, user).expect(404);
  });

  it('refuses to delete one with a payment (409 with the count) and archives it instead', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    const march = (await month(user, '2026-03'))[0]!;
    await month(user, '2026-04');
    await e2e.post(`/bills/${march.id}/pay`, user, {}).expect(200);

    const refused = await e2e.delete(`/obligations/${loan.id}`, user).expect(409);
    expect(refused.body.error.details).toEqual({ paidBills: '1' });
    expect(await names(user)).toHaveLength(1);

    await e2e.post(`/obligations/${loan.id}/archive`, user, {}).expect(204);
    expect(await names(user)).toEqual([]);
    // The paid bill stays in its month; the unpaid one is gone; no new bills appear.
    expect((await e2e.get('/bills?month=2026-03', user).expect(200)).body.bills).toHaveLength(1);
    expect((await e2e.get('/bills?month=2026-04', user).expect(200)).body.bills).toEqual([]);
    expect(await month(user, '2026-05')).toEqual([]);
    await e2e.post(`/obligations/${loan.id}/archive`, user, {}).expect(404);
    await e2e.patch(`/obligations/${loan.id}`, user, { name: 'x' }).expect(404);
  });

  it("keeps users apart: another user's obligation answers 404 and stays", async () => {
    const user = await e2e.newUser();
    const other = await e2e.newUser();
    const loan = await addLoan(user);
    await e2e.delete(`/obligations/${loan.id}`, other).expect(404);
    await e2e.post(`/obligations/${loan.id}/archive`, other, {}).expect(404);
    expect(await names(user)).toHaveLength(1);
  });

  it('lets the database refuse deleting an obligation that still has bills', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    await month(user, '2026-03');
    await expect(e2e.prisma.obligation.delete({ where: { id: loan.id } })).rejects.toThrow();
  });
});
