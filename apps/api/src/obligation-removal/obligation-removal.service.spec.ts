import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillsService } from '../bills/bills.service.js';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { ObligationsService } from '../obligations/obligations.service.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { ObligationRemovalService } from './obligation-removal.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let obligations: InMemoryObligations;
let obligationsService: ObligationsService;
let bills: InMemoryBills;
let billsService: BillsService;
let service: ObligationRemovalService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  const clock = new FakeClock(); // 2026-11-08
  const nameOf = (userId: string, id: string) =>
    categories.categories.find((c) => c.userId === userId && c.id === id)!.name;
  obligations = new InMemoryObligations(nameOf, () => clock.now().toISOString().slice(0, 7));
  const transactions = new InMemoryTransactions(nameOf);
  obligationsService = new ObligationsService(obligations, categories);
  bills = new InMemoryBills(obligations, transactions);
  billsService = new BillsService(bills, obligations, clock);
  service = new ObligationRemovalService(obligations, bills);
});

const bill = (name: string, user = A) =>
  obligationsService.create(user, {
    recurrence: 'monthly',
    name,
    categoryId: categories.categories.find((c) => c.userId === user && c.name === 'Water')!.id,
    expectedAmountMkd: 1_000,
    dueDay: 10,
    startMonth: '2026-09',
  } as never);

async function failure(call: Promise<unknown>): Promise<HttpException> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const billsOf = (id: string) => bills.rows.filter((r) => r.obligationId === id);

describe('delete', () => {
  it('deletes an obligation without payments together with its unpaid bills', async () => {
    const water = await bill('Water');
    await billsService.generate(A, '2026-10');
    await billsService.generate(A, '2026-11');
    await service.delete(A, water.id);
    expect((await obligationsService.list(A)).obligations).toEqual([]);
    expect(billsOf(water.id)).toEqual([]);
  });

  it('refuses when a bill was paid, saying how many, and changes nothing', async () => {
    const water = await bill('Water');
    await billsService.generate(A, '2026-10');
    await billsService.generate(A, '2026-11');
    const october = (await billsService.list(A, '2026-10')).bills[0]!;
    await billsService.pay(A, october.id, {});
    const error = await failure(service.delete(A, water.id));
    expect(error.getStatus()).toBe(409);
    expect(
      (error.getResponse() as { error: { details: Record<string, string> } }).error.details,
    ).toEqual({ paidBills: '1' });
    expect((await obligationsService.list(A)).obligations).toHaveLength(1);
    expect(billsOf(water.id)).toHaveLength(2);
  });

  it("answers 404 for an unknown id and for another user's obligation", async () => {
    const water = await bill('Water');
    expect((await failure(service.delete(A, 'nope'))).getStatus()).toBe(404);
    expect((await failure(service.delete(B, water.id))).getStatus()).toBe(404);
    expect((await obligationsService.list(A)).obligations).toHaveLength(1);
  });

  it('leaves other obligations and their bills alone', async () => {
    const water = await bill('Water');
    const other = await bill('Electricity');
    await billsService.generate(A, '2026-11');
    await service.delete(A, water.id);
    expect(billsOf(other.id)).toHaveLength(1);
  });
});

describe('archive', () => {
  async function paidWater() {
    const water = await bill('Water');
    for (const month of ['2026-09', '2026-10', '2026-11']) await billsService.generate(A, month);
    const september = (await billsService.list(A, '2026-09')).bills[0]!;
    await billsService.pay(A, september.id, {});
    return water;
  }

  it('hides it, removes its unpaid bills and keeps the paid ones', async () => {
    const water = await paidWater();
    await service.archive(A, water.id);
    expect((await obligationsService.list(A)).obligations).toEqual([]);
    expect(billsOf(water.id).map((r) => r.period)).toEqual(['2026-09']);
    expect((await billsService.list(A, '2026-09')).bills).toHaveLength(1);
  });

  it('stops making new bills', async () => {
    const water = await paidWater();
    await service.archive(A, water.id);
    await billsService.generate(A, '2026-12');
    await billsService.sync(A);
    expect(billsOf(water.id).map((r) => r.period)).toEqual(['2026-09']);
  });

  it('can be used without payments too, and answers 404 afterwards and for others', async () => {
    const water = await bill('Water');
    await service.archive(A, water.id);
    expect((await failure(service.archive(A, water.id))).getStatus()).toBe(404);
    const other = await bill('Gas');
    expect((await failure(service.archive(B, other.id))).getStatus()).toBe(404);
    expect((await obligationsService.list(A)).obligations).toHaveLength(1);
  });
});
