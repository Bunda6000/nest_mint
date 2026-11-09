import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { ObligationsService } from '../obligations/obligations.service.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { BillsService } from './bills.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let obligations: InMemoryObligations;
let obligationsService: ObligationsService;
let billsRepository: InMemoryBills;
let clock: FakeClock;
let service: BillsService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  obligations = new InMemoryObligations(
    (userId, id) => categories.categories.find((c) => c.userId === userId && c.id === id)!.name,
  );
  obligationsService = new ObligationsService(obligations, categories);
  billsRepository = new InMemoryBills(obligations);
  clock = new FakeClock(); // 2026-11-08
  service = new BillsService(billsRepository, obligations, clock);
});

const categoryId = (name: string, user = A): string =>
  categories.categories.find((c) => c.userId === user && c.name === name)!.id;

const add = (over: Record<string, unknown> = {}, user = A) =>
  obligationsService.create(user, {
    recurrence: 'monthly',
    name: 'Electricity',
    payee: 'EVN',
    categoryId: categoryId('Electricity', user),
    expectedAmountMkd: 4_500,
    dueDay: 15,
    startMonth: '2026-01',
    ...over,
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

describe('generate: what is created', () => {
  it('creates a monthly bill with its due date, amount and obligation details', async () => {
    const o = await add();
    expect(await service.generate(A, '2026-11')).toEqual({ month: '2026-11', created: 1 });
    expect((await service.list(A, '2026-11')).bills).toEqual([
      {
        id: expect.any(String),
        obligationId: o.id,
        obligationName: 'Electricity',
        payee: 'EVN',
        categoryId: categoryId('Electricity'),
        categoryName: 'Electricity',
        period: '2026-11',
        dueDate: '2026-11-15',
        expectedAmountMkd: 4_500,
      },
    ]);
  });

  it('creates a bill for every obligation that is due, and only those', async () => {
    await add({ name: 'Electricity' });
    await add({
      name: 'Insurance',
      recurrence: 'every_n_months',
      everyNMonths: 3,
      startMonth: '2026-02',
    }); // Feb, May, Aug, Nov
    await add({ name: 'Heating', recurrence: 'custom_months', months: [11, 12, 1, 2, 3] });
    await add({ name: 'Garden', recurrence: 'custom_months', months: [4, 5, 6] });
    await add({ name: 'Old loan', endMonth: '2026-10' });
    await add({ name: 'Future gym', startMonth: '2026-12' });
    await add({
      name: 'Quarterly',
      recurrence: 'every_n_months',
      everyNMonths: 3,
      startMonth: '2026-01',
    }); // Jan, Apr, Jul, Oct

    expect((await service.generate(A, '2026-11')).created).toBe(3);
    const names = (await service.list(A, '2026-11')).bills.map((b) => b.obligationName).sort();
    expect(names).toEqual(['Electricity', 'Heating', 'Insurance']);
  });

  it('follows every n months across a year boundary', async () => {
    clock.set(new Date('2026-12-20T10:00:00Z'));
    await add({ recurrence: 'every_n_months', everyNMonths: 2, startMonth: '2026-11' });
    const created = [];
    for (const m of ['2026-11', '2026-12', '2027-01']) {
      created.push((await service.generate(A, m)).created);
    }
    expect(created).toEqual([1, 0, 1]);
  });

  it('uses the last day of a short month for a late due day', async () => {
    await add({ dueDay: 31 });
    await service.generate(A, '2026-02');
    await service.generate(A, '2026-11');
    expect((await service.list(A, '2026-02')).bills[0]!.dueDate).toBe('2026-02-28');
    expect((await service.list(A, '2026-11')).bills[0]!.dueDate).toBe('2026-11-30');
  });

  it('can create earlier months, so history is there when a bill is added late', async () => {
    await add({ startMonth: '2026-08' });
    expect((await service.generate(A, '2026-08')).created).toBe(1);
    expect((await service.generate(A, '2026-07')).created).toBe(0);
  });

  it('creates nothing when no obligation is due', async () => {
    expect(await service.generate(A, '2026-11')).toEqual({ month: '2026-11', created: 0 });
    await add({ startMonth: '2027-01' });
    expect((await service.generate(A, '2026-11')).created).toBe(0);
    expect((await service.list(A, '2026-11')).bills).toEqual([]);
  });
});

describe('generate: never twice', () => {
  it('a second run creates nothing and leaves one bill', async () => {
    await add();
    expect((await service.generate(A, '2026-11')).created).toBe(1);
    expect((await service.generate(A, '2026-11')).created).toBe(0);
    expect((await service.generate(A, '2026-11')).created).toBe(0);
    expect((await service.list(A, '2026-11')).bills).toHaveLength(1);
  });

  it('only creates the bill that is missing', async () => {
    await add({ name: 'Electricity' });
    await service.generate(A, '2026-11');
    await add({ name: 'Water' });
    expect((await service.generate(A, '2026-11')).created).toBe(1);
    expect((await service.list(A, '2026-11')).bills).toHaveLength(2);
  });

  it('a bill keeps the amount and due date it was created with when the obligation changes', async () => {
    const o = await add();
    await service.generate(A, '2026-11');
    await obligationsService.update(A, o.id, { expectedAmountMkd: 6_000, dueDay: 28 });
    expect((await service.generate(A, '2026-11')).created).toBe(0);
    expect((await service.list(A, '2026-11')).bills[0]).toMatchObject({
      expectedAmountMkd: 4_500,
      dueDate: '2026-11-15',
    });
  });

  it('the next month uses the changed amount and due day', async () => {
    const o = await add();
    await service.generate(A, '2026-11');
    await obligationsService.update(A, o.id, { expectedAmountMkd: 6_000, dueDay: 28 });
    await service.generate(A, '2026-12');
    expect((await service.list(A, '2026-12')).bills[0]).toMatchObject({
      expectedAmountMkd: 6_000,
      dueDate: '2026-12-28',
    });
  });

  it('different months get their own bill', async () => {
    await add();
    await service.generate(A, '2026-10');
    await service.generate(A, '2026-11');
    expect((await service.list(A, '2026-10')).bills).toHaveLength(1);
    expect((await service.list(A, '2026-11')).bills).toHaveLength(1);
  });
});

describe('generate: how far ahead', () => {
  it('allows this month and next month', async () => {
    await add();
    expect((await service.generate(A, '2026-11')).created).toBe(1);
    expect((await service.generate(A, '2026-12')).created).toBe(1);
  });

  it('refuses two months ahead', async () => {
    const error = await failure(service.generate(A, '2027-01'));
    expect(error.getStatus()).toBe(400);
    expect(
      (error.getResponse() as { error: { code: string; details: Record<string, string> } }).error,
    ).toMatchObject({ code: ErrorCode.ValidationFailed, details: { month: expect.any(String) } });
  });

  it('counts next month across the year boundary: in December, January is allowed and February is not', async () => {
    clock.set(new Date('2026-12-10T10:00:00Z'));
    await add();
    expect((await service.generate(A, '2027-01')).created).toBe(1);
    expect((await failure(service.generate(A, '2027-02'))).getStatus()).toBe(400);
  });

  it('creates nothing when it refuses', async () => {
    await add();
    await failure(service.generate(A, '2027-03'));
    expect(billsRepository.rows).toHaveLength(0);
  });
});

describe('list', () => {
  it('only reads: it never creates bills', async () => {
    await add();
    expect((await service.list(A, '2026-11')).bills).toEqual([]);
    expect(billsRepository.rows).toHaveLength(0);
  });

  it('puts bills in due-date order, then by name', async () => {
    await add({ name: 'Water', dueDay: 10 });
    await add({ name: 'Electricity', dueDay: 15 });
    await add({ name: 'Internet', dueDay: 10 });
    await add({ name: 'Rent', dueDay: 1 });
    await service.generate(A, '2026-11');
    const names = (await service.list(A, '2026-11')).bills.map((b) => b.obligationName);
    expect(names).toEqual(['Rent', 'Internet', 'Water', 'Electricity']);
  });

  it('shows only the requested month', async () => {
    await add();
    await service.generate(A, '2026-10');
    expect((await service.list(A, '2026-11')).bills).toEqual([]);
    expect((await service.list(A, '2026-10')).bills).toHaveLength(1);
  });
});

describe('two users', () => {
  it('each only gets bills from their own obligations', async () => {
    await add({ name: 'Mine' });
    await add({ name: 'Theirs' }, B);
    expect((await service.generate(A, '2026-11')).created).toBe(1);
    expect((await service.list(A, '2026-11')).bills.map((b) => b.obligationName)).toEqual(['Mine']);
    expect((await service.list(B, '2026-11')).bills).toEqual([]);
    expect((await service.generate(B, '2026-11')).created).toBe(1);
    expect((await service.list(B, '2026-11')).bills.map((b) => b.obligationName)).toEqual([
      'Theirs',
    ]);
    expect((await service.list(A, '2026-11')).bills).toHaveLength(1);
  });
});
