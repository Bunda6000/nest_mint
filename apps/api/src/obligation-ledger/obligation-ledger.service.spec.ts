import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillsService } from '../bills/bills.service.js';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { ObligationsService } from '../obligations/obligations.service.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { ObligationLedgerService } from './obligation-ledger.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let obligationsService: ObligationsService;
let bills: BillsService;
let ledger: ObligationLedgerService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  const clock = new FakeClock(); // 2026-11-08
  const nameOf = (userId: string, id: string) =>
    categories.categories.find((c) => c.userId === userId && c.id === id)!.name;
  const obligations = new InMemoryObligations(nameOf, () => clock.now().toISOString().slice(0, 7));
  const transactions = new InMemoryTransactions(nameOf);
  obligationsService = new ObligationsService(obligations, categories);
  const billsRepository = new InMemoryBills(obligations, transactions);
  bills = new BillsService(billsRepository, obligations, clock);
  ledger = new ObligationLedgerService(billsRepository, obligations, clock);
});

const electricity = () =>
  obligationsService.create(A, {
    recurrence: 'monthly',
    name: 'Electricity',
    payee: 'EVN',
    categoryId: categories.categories.find((c) => c.userId === A && c.name === 'Electricity')!.id,
    expectedAmountMkd: 4_500,
    dueDay: 15,
    startMonth: '2025-11',
  } as never);

async function billOf(month: string, obligationId: string) {
  await bills.generate(A, month);
  return (await bills.list(A, month)).bills.find((b) => b.obligationId === obligationId)!;
}

describe('ledger', () => {
  it('lists the bills of the year oldest first, with totals for the year and for all years', async () => {
    const o = await electricity();
    for (const month of ['2025-11', '2025-12', '2026-01', '2026-02']) await billOf(month, o.id);

    const result = await ledger.ledger(A, o.id, 2026);
    expect(result).toMatchObject({
      name: 'Electricity',
      payee: 'EVN',
      year: 2026,
      years: [2025, 2026],
      yearTotalMkd: 9_000,
      yearPaidMkd: 0,
      lifetimeMkd: 18_000,
    });
    expect(result.rows.map((r) => [r.period, r.amountMkd, r.paidOn, r.invoiceRef])).toEqual([
      ['2026-01', 4_500, null, null],
      ['2026-02', 4_500, null, null],
    ]);
  });

  it('shows the invoice amount and reference, and what was really paid with its day', async () => {
    const o = await electricity();
    const january = await billOf('2026-01', o.id);
    await bills.update(A, january.id, { actualAmountMkd: 5_200, invoiceRef: 'INV-7' });
    const february = await billOf('2026-02', o.id);
    await bills.pay(A, february.id, { paidOn: '2026-02-10', amountMkd: 4_800 } as never);

    const { rows, yearTotalMkd, yearPaidMkd } = await ledger.ledger(A, o.id, 2026);
    expect(rows[0]).toMatchObject({ amountMkd: 5_200, invoiceRef: 'INV-7', paidOn: null });
    expect(rows[1]).toMatchObject({ amountMkd: 4_800, paidOn: '2026-02-10' });
    expect(yearTotalMkd).toBe(10_000);
    expect(yearPaidMkd).toBe(4_800);
  });

  it('counts a bill in the year of its period, not the year it was paid', async () => {
    const o = await electricity();
    const december = await billOf('2025-12', o.id);
    await bills.pay(A, december.id, { paidOn: '2026-01-05' } as never);
    expect((await ledger.ledger(A, o.id, 2025)).yearPaidMkd).toBe(4_500);
    expect((await ledger.ledger(A, o.id, 2026)).yearPaidMkd).toBe(0);
  });

  it('defaults to this year and offers a year with no bills', async () => {
    const o = await electricity();
    await billOf('2025-12', o.id);
    const result = await ledger.ledger(A, o.id);
    expect(result.year).toBe(2026);
    expect(result.years).toEqual([2025, 2026]);
    expect(result.rows).toEqual([]);
  });

  it('knows an obligation that has no bills yet', async () => {
    const o = await electricity();
    expect(await ledger.ledger(A, o.id, 2026)).toMatchObject({
      name: 'Electricity',
      rows: [],
      lifetimeMkd: 0,
    });
  });

  it("answers 404 for an unknown obligation or another user's", async () => {
    const o = await electricity();
    for (const [user, id] of [
      [A, 'nope'],
      [B, o.id],
    ] as const) {
      const error = await ledger.ledger(user, id, 2026).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
    }
  });
});
