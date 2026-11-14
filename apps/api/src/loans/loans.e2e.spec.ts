import type {
  BillsResponse,
  CategoriesResponse,
  ObligationResponse,
  TransactionsResponse,
} from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('loan extra payments and payoff', () => {
  const e2e = new E2eHarness('@loans-test.example');

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

  // 120,000 at 0 %: twelve payments of 10,000 in 2026.
  const addLoan = async (user: E2eUser) =>
    (
      await e2e
        .post('/obligations/loans', user, {
          name: 'Mortgage',
          lender: 'Bank',
          loanType: 'housing',
          principalMkd: 120_000,
          annualRateBp: 0,
          categoryId: await category(user, 'Electricity'),
          dueDay: 5,
          startMonth: '2026-01',
          endMonth: '2026-12',
          monthlyPaymentMkd: 10_000,
        })
        .expect(201)
    ).body as ObligationResponse;

  const billsIn = async (user: E2eUser, period: string) => {
    await e2e.post(`/bills/generate?month=${period}`, user, {}).expect(200);
    return ((await e2e.get(`/bills?month=${period}`, user).expect(200)).body as BillsResponse)
      .bills;
  };

  const expensesIn = async (user: E2eUser, month: string) =>
    ((await e2e.get(`/transactions?month=${month}`, user).expect(200)).body as TransactionsResponse)
      .transactions;

  it('refuses both endpoints without a login', async () => {
    const id = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f';
    await e2e.http().post(`/api/v1/obligations/${id}/extra-payments`).send({}).expect(401);
    await e2e.http().post(`/api/v1/obligations/${id}/payoff`).send({}).expect(401);
  });

  it('shorten: ends the loan earlier, removes later unpaid bills and records an expense', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    await billsIn(user, '2026-10');
    await billsIn(user, '2026-12');
    const updated = (
      await e2e
        .post(`/obligations/${loan.id}/extra-payments`, user, {
          paidOn: '2026-05-10',
          amountMkd: 20_000,
          effect: 'shorten',
        })
        .expect(201)
    ).body as ObligationResponse;
    expect(updated.endMonth).toBe('2026-10');
    expect(updated.loan!.extraPayments).toMatchObject([
      { paidOn: '2026-05-10', amountMkd: 20_000, kind: 'extra' },
    ]);
    expect((await billsIn(user, '2026-10')).map((b) => b.expectedAmountMkd)).toEqual([10_000]);
    expect(await e2e.prisma.bill.count({ where: { obligationId: loan.id } })).toBe(1);
    const expenses = await expensesIn(user, '2026-05');
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ amountMkd: 20_000, note: 'Extra payment · Mortgage' });
  });

  it('lower_payment: needs the new payment, keeps the end date and moves unpaid bills', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    await billsIn(user, '2026-09');
    const body = { paidOn: '2026-05-10', amountMkd: 20_000, effect: 'lower_payment' };
    const refused = await e2e
      .post(`/obligations/${loan.id}/extra-payments`, user, body)
      .expect(400);
    expect(Object.keys(refused.body.error.details)).toContain('newMonthlyPaymentMkd');
    const updated = (
      await e2e
        .post(`/obligations/${loan.id}/extra-payments`, user, {
          ...body,
          newMonthlyPaymentMkd: 6_000,
        })
        .expect(201)
    ).body as ObligationResponse;
    expect(updated.endMonth).toBe('2026-12');
    expect(updated.loan!.rateChanges).toEqual([
      { effectiveMonth: '2026-06', annualRateBp: 0, monthlyPaymentMkd: 6_000 },
    ]);
    expect((await billsIn(user, '2026-09')).map((b) => b.expectedAmountMkd)).toEqual([6_000]);
  });

  it('refuses a payment that pays everything off, a plain bill and other users', async () => {
    const user = await e2e.newUser();
    const other = await e2e.newUser();
    const loan = await addLoan(user);
    const body = { paidOn: '2026-05-10', amountMkd: 90_000, effect: 'none' };
    await e2e.post(`/obligations/${loan.id}/extra-payments`, user, body).expect(400);
    await e2e.post(`/obligations/${loan.id}/extra-payments`, other, body).expect(404);
    expect(await expensesIn(user, '2026-05')).toEqual([]);
  });

  it('pays off: records the expense, ends the loan that month and removes unpaid bills from it', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    const [september] = await billsIn(user, '2026-09');
    await e2e.post(`/bills/${september!.id}/pay`, user, {}).expect(200);
    await billsIn(user, '2026-10');
    const updated = (
      await e2e
        .post(`/obligations/${loan.id}/payoff`, user, { paidOn: '2026-10-05', amountMkd: 40_000 })
        .expect(201)
    ).body as ObligationResponse;
    expect(updated.endMonth).toBe('2026-10');
    expect(updated.loan!.extraPayments).toMatchObject([{ amountMkd: 40_000, kind: 'payoff' }]);
    expect(await e2e.prisma.bill.count({ where: { obligationId: loan.id } })).toBe(1);
    expect(await expensesIn(user, '2026-10')).toMatchObject([{ note: 'Loan payoff · Mortgage' }]);
    await e2e
      .post(`/obligations/${loan.id}/payoff`, user, { paidOn: '2026-10-06', amountMkd: 1 })
      .expect(409);
  });

  it('lets the database refuse a bad extra payment and removes them with the loan', async () => {
    const user = await e2e.newUser();
    const loan = await addLoan(user);
    const row = {
      userId: user.id,
      obligationId: loan.id,
      paidOn: new Date('2026-05-10T00:00:00Z'),
      amountMkd: 1_000,
      kind: 'extra' as const,
    };
    await expect(
      e2e.prisma.loanExtraPayment.create({ data: { ...row, amountMkd: 0 } }),
    ).rejects.toThrow();
    await e2e.prisma.loanExtraPayment.create({ data: row });
    await e2e.prisma.obligation.delete({ where: { id: loan.id } });
    expect(await e2e.prisma.loanExtraPayment.count({ where: { obligationId: loan.id } })).toBe(0);
  });
});
