import { HttpException } from '@nestjs/common';
import { ErrorCode, PAID_TAB_LIMIT } from '@nestmint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { ObligationsService } from '../obligations/obligations.service.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { BillsService } from './bills.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let obligations: InMemoryObligations;
let obligationsService: ObligationsService;
let billsRepository: InMemoryBills;
let transactions: InMemoryTransactions;
let clock: FakeClock;
let service: BillsService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  clock = new FakeClock(); // 2026-11-08
  const nameOf = (userId: string, id: string) =>
    categories.categories.find((c) => c.userId === userId && c.id === id)!.name;
  obligations = new InMemoryObligations(nameOf, () => clock.now().toISOString().slice(0, 7));
  transactions = new InMemoryTransactions(nameOf);
  obligationsService = new ObligationsService(obligations, categories);
  billsRepository = new InMemoryBills(obligations, transactions);
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
        actualAmountMkd: null,
        invoiceRef: null,
        amountMkd: 4_500,
        status: 'due',
        paidOn: null,
        transactionId: null,
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

const unpaidNames = async (tab: 'due' | 'overdue' | 'paid', asOf?: string, user = A) =>
  (await service.inbox(user, tab, asOf)).bills.map((b) => `${b.obligationName} ${b.dueDate}`);

const billOf = async (name: string, month: string, user = A) =>
  (await service.list(user, month)).bills.find((b) => b.obligationName === name)!;

const expensesOf = (user = A) => transactions.rows.filter((t) => t.userId === user);

describe('sync: catching up', () => {
  it('creates this month and next month for a bill entered today, nothing earlier', async () => {
    await add(); // entered in 2026-11, first month 2026-01
    expect(await service.sync(A)).toEqual({ created: 2 });
    expect(billsRepository.rows.map((r) => r.period).sort()).toEqual(['2026-11', '2026-12']);
  });

  it('creates the months missed since the bill was entered, when Bills was not opened', async () => {
    clock.set(new Date('2026-08-10T10:00:00Z'));
    await add({ name: 'Monthly' });
    await add({
      name: 'Bimonthly',
      recurrence: 'every_n_months',
      everyNMonths: 2,
      startMonth: '2026-08',
    });
    clock.set(new Date('2026-11-08T10:00:00Z')); // never opened Bills in between
    expect(await service.sync(A)).toEqual({ created: 5 + 3 }); // Aug..Dec, and Aug, Oct, Dec
    const periods = (name: string) =>
      billsRepository.rows
        .filter((r) => obligations.rows.find((o) => o.id === r.obligationId)!.name === name)
        .map((r) => r.period)
        .sort();
    expect(periods('Monthly')).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    expect(periods('Bimonthly')).toEqual(['2026-08', '2026-10', '2026-12']);
  });

  it('shows the missed months as overdue', async () => {
    clock.set(new Date('2026-08-10T10:00:00Z'));
    await add();
    clock.set(new Date('2026-11-08T10:00:00Z'));
    await service.sync(A);
    expect(await unpaidNames('overdue')).toEqual([
      'Electricity 2026-08-15',
      'Electricity 2026-09-15',
      'Electricity 2026-10-15',
    ]);
    expect((await service.inbox(A, 'due')).counts).toEqual({ due: 2, overdue: 3, paid: 0 });
  });

  it('starts at the first month when that is after the month it was entered', async () => {
    await add({ startMonth: '2026-12' });
    await service.sync(A);
    expect(billsRepository.rows.map((r) => r.period)).toEqual(['2026-12']);
  });

  it('never goes back before the month the bill was entered, even with an old first month', async () => {
    await add({ startMonth: '2024-01' });
    await service.sync(A);
    expect(billsRepository.rows.map((r) => r.period).sort()).toEqual(['2026-11', '2026-12']);
  });

  it('stops at the last month of the obligation', async () => {
    clock.set(new Date('2026-08-10T10:00:00Z'));
    await add({ endMonth: '2026-10' });
    clock.set(new Date('2026-11-08T10:00:00Z'));
    await service.sync(A);
    expect(billsRepository.rows.map((r) => r.period).sort()).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('goes back at most 36 months', async () => {
    clock.set(new Date('2022-01-10T10:00:00Z'));
    await add({ startMonth: '2022-01' });
    clock.set(new Date('2026-11-08T10:00:00Z'));
    expect((await service.sync(A)).created).toBe(37); // 2023-12 .. 2026-12
    const periods = billsRepository.rows.map((r) => r.period).sort();
    expect(periods[0]).toBe('2023-12');
    expect(periods.at(-1)).toBe('2026-12');
  });

  it('is safe to repeat and only adds what is missing', async () => {
    await add({ name: 'Electricity' });
    expect((await service.sync(A)).created).toBe(2);
    expect((await service.sync(A)).created).toBe(0);
    await add({ name: 'Water' });
    expect((await service.sync(A)).created).toBe(2);
    expect(billsRepository.rows).toHaveLength(4);
  });

  it('leaves a bill as it is, including its amount, even when the obligation changed', async () => {
    const o = await add();
    await service.sync(A);
    await obligationsService.update(A, o.id, { expectedAmountMkd: 9_000 });
    expect((await service.sync(A)).created).toBe(0);
    expect((await billOf('Electricity', '2026-11')).expectedAmountMkd).toBe(4_500);
  });

  it('does not recreate a bill that was paid', async () => {
    await add();
    await service.sync(A);
    const bill = await billOf('Electricity', '2026-11');
    await service.pay(A, bill.id, {});
    expect((await service.sync(A)).created).toBe(0);
    expect(billsRepository.rows).toHaveLength(2);
  });

  it('only uses the own obligations', async () => {
    await add({ name: 'Mine' });
    await add({ name: 'Theirs' }, B);
    expect((await service.sync(A)).created).toBe(2);
    expect((await service.inbox(B, 'due')).counts).toEqual({ due: 0, overdue: 0, paid: 0 });
    expect((await service.sync(B)).created).toBe(2);
  });

  it('creates nothing when there are no obligations', async () => {
    expect(await service.sync(A)).toEqual({ created: 0 });
  });

  it('in December it reaches into the next year', async () => {
    clock.set(new Date('2026-12-10T10:00:00Z'));
    await add();
    await service.sync(A);
    expect(billsRepository.rows.map((r) => r.period).sort()).toEqual(['2026-12', '2027-01']);
  });
});

describe('inbox: the tabs', () => {
  beforeEach(async () => {
    await add({ name: 'Electricity', dueDay: 5 });
    await add({ name: 'Water', dueDay: 8 });
    await add({ name: 'Rent', dueDay: 20 });
    await service.sync(A); // 2026-11 and 2026-12 of each; today is 2026-11-08
  });

  it('Overdue holds unpaid bills due before today; a bill due today is Due, not overdue', async () => {
    expect(await unpaidNames('overdue')).toEqual(['Electricity 2026-11-05']);
    expect(await unpaidNames('due')).toEqual([
      'Water 2026-11-08',
      'Rent 2026-11-20',
      'Electricity 2026-12-05',
      'Water 2026-12-08',
      'Rent 2026-12-20',
    ]);
  });

  it('counts all three tabs on every tab', async () => {
    for (const tab of ['due', 'overdue', 'paid'] as const) {
      expect((await service.inbox(A, tab)).counts).toEqual({ due: 5, overdue: 1, paid: 0 });
    }
  });

  it('measures overdue on the given day', async () => {
    expect(await unpaidNames('overdue', '2026-11-09')).toEqual([
      'Electricity 2026-11-05',
      'Water 2026-11-08',
    ]);
    expect((await service.inbox(A, 'due', '2026-11-09')).counts).toEqual({
      due: 4,
      overdue: 2,
      paid: 0,
    });
    expect((await service.inbox(A, 'due', '2026-11-01')).counts.overdue).toBe(0);
  });

  it('puts the oldest overdue bill first', async () => {
    clock.set(new Date('2026-12-30T10:00:00Z'));
    await service.sync(A);
    const names = await unpaidNames('overdue');
    expect(names[0]).toBe('Electricity 2026-11-05');
    expect(names).toHaveLength(6);
    expect([...names].sort((a, b) => a.slice(-10).localeCompare(b.slice(-10)))).toEqual(names);
  });

  it('marks each bill with its status', async () => {
    const overdue = (await service.inbox(A, 'overdue')).bills;
    expect(overdue.every((b) => b.status === 'overdue')).toBe(true);
    const due = (await service.inbox(A, 'due')).bills;
    expect(due.every((b) => b.status === 'due')).toBe(true);
  });

  it('a paid bill leaves Due and Overdue and appears under Paid', async () => {
    const bill = await billOf('Electricity', '2026-11');
    await service.pay(A, bill.id, {});
    expect(await unpaidNames('overdue')).toEqual([]);
    const paid = await service.inbox(A, 'paid');
    expect(paid.counts).toEqual({ due: 5, overdue: 0, paid: 1 });
    expect(paid.bills).toHaveLength(1);
    expect(paid.bills[0]).toMatchObject({ obligationName: 'Electricity', status: 'paid' });
  });

  it('lists Paid by latest payment first', async () => {
    const rent = await billOf('Rent', '2026-11');
    const water = await billOf('Water', '2026-11');
    const electricity = await billOf('Electricity', '2026-11');
    await service.pay(A, rent.id, { paidOn: '2026-11-02' });
    await service.pay(A, water.id, { paidOn: '2026-11-08' });
    await service.pay(A, electricity.id, { paidOn: '2026-11-05' });
    expect(await unpaidNames('paid')).toEqual([
      'Water 2026-11-08',
      'Electricity 2026-11-05',
      'Rent 2026-11-20',
    ]);
  });

  it('shows at most the latest payments under Paid, but counts all of them', async () => {
    for (let i = 0; i < PAID_TAB_LIMIT + 1 - 3; i += 1) await add({ name: `Extra ${i}` });
    await service.sync(A);
    const all = (await service.list(A, '2026-11')).bills;
    await service.payMany(A, { billIds: all.slice(0, PAID_TAB_LIMIT + 1).map((b) => b.id) });
    const paid = await service.inbox(A, 'paid');
    expect(paid.bills).toHaveLength(PAID_TAB_LIMIT);
    expect(paid.counts.paid).toBe(PAID_TAB_LIMIT + 1);
  });

  it("never shows another user's bills", async () => {
    expect(await unpaidNames('due', undefined, B)).toEqual([]);
    expect(await unpaidNames('paid', undefined, B)).toEqual([]);
    expect((await service.inbox(B, 'due')).counts).toEqual({ due: 0, overdue: 0, paid: 0 });
  });

  it('allows a day ahead (the phone can be a day ahead of the server) but not more', async () => {
    expect((await service.inbox(A, 'due', '2026-11-09')).tab).toBe('due');
    const error = await failure(service.inbox(A, 'due', '2026-11-10'));
    expect(error.getStatus()).toBe(400);
    expect(
      (error.getResponse() as { error: { details: Record<string, string> } }).error.details,
    ).toHaveProperty('asOf');
  });

  it('list also reports statuses on the given day', async () => {
    const today = (await service.list(A, '2026-11', '2026-11-08')).bills.map((b) => b.status);
    expect(today).toEqual(['overdue', 'due', 'due']);
    const tomorrow = (await service.list(A, '2026-11', '2026-11-09')).bills.map((b) => b.status);
    expect(tomorrow).toEqual(['overdue', 'overdue', 'due']);
  });
});

describe('pay: one bill', () => {
  let billId: string;
  beforeEach(async () => {
    await add({ dueDay: 5 });
    await service.sync(A);
    billId = (await billOf('Electricity', '2026-11')).id;
  });

  it('defaults to today and the bill amount, and creates an expense in the bill category', async () => {
    const paid = await service.pay(A, billId, {});
    expect(paid).toMatchObject({
      id: billId,
      status: 'paid',
      paidOn: '2026-11-08',
      amountMkd: 4_500,
      expectedAmountMkd: 4_500,
      transactionId: expect.any(String),
    });
    expect(expensesOf()).toEqual([
      expect.objectContaining({
        id: paid.transactionId,
        kind: 'expense',
        categoryId: categoryId('Electricity'),
        amountMkd: 4_500,
        occurredOn: '2026-11-08',
        note: 'Electricity',
      }),
    ]);
  });

  it('takes the day and the amount that were entered, keeping the expected amount', async () => {
    const paid = await service.pay(A, billId, { paidOn: '2026-11-03', amountMkd: 4_380 });
    expect(paid).toMatchObject({
      paidOn: '2026-11-03',
      amountMkd: 4_380,
      expectedAmountMkd: 4_500,
    });
    expect(expensesOf()[0]).toMatchObject({ amountMkd: 4_380, occurredOn: '2026-11-03' });
  });

  it('pays the actual amount when it was entered, and its invoice reference goes into the note', async () => {
    await service.update(A, billId, { actualAmountMkd: 4_820, invoiceRef: 'INV-118' });
    const paid = await service.pay(A, billId, {});
    expect(paid).toMatchObject({ amountMkd: 4_820, actualAmountMkd: 4_820, invoiceRef: 'INV-118' });
    expect(expensesOf()[0]).toMatchObject({ amountMkd: 4_820, note: 'Electricity · INV-118' });
  });

  it('an amount typed at payment time wins over the actual amount', async () => {
    await service.update(A, billId, { actualAmountMkd: 4_820 });
    expect((await service.pay(A, billId, { amountMkd: 4_000 })).amountMkd).toBe(4_000);
  });

  it('is paid, even when paid after the due date', async () => {
    const paid = await service.pay(A, billId, { paidOn: '2026-11-08' });
    expect(paid.status).toBe('paid');
    expect(await unpaidNames('overdue')).toEqual([]);
  });

  it("the paid day and amount are the expense's own: correcting the expense corrects the bill", async () => {
    await service.pay(A, billId, {});
    const expense = transactions.rows[0]!;
    expense.amountMkd = 4_444;
    expense.occurredOn = '2026-11-04';
    expect(await billOf('Electricity', '2026-11')).toMatchObject({
      amountMkd: 4_444,
      paidOn: '2026-11-04',
    });
  });

  it('refuses a bill that is already paid, and creates no second expense', async () => {
    await service.pay(A, billId, {});
    const error = await failure(service.pay(A, billId, {}));
    expect(error.getStatus()).toBe(409);
    expect(expensesOf()).toHaveLength(1);
  });

  it('refuses an unknown bill', async () => {
    expect((await failure(service.pay(A, 'nope', {}))).getStatus()).toBe(404);
    expect(expensesOf()).toHaveLength(0);
  });

  it("refuses another user's bill as not found, and changes nothing", async () => {
    const error = await failure(service.pay(B, billId, {}));
    expect(error.getStatus()).toBe(404);
    expect(expensesOf(B)).toHaveLength(0);
    expect((await billOf('Electricity', '2026-11')).status).toBe('overdue');
  });

  it('refuses a day more than a day ahead, and creates nothing', async () => {
    const error = await failure(service.pay(A, billId, { paidOn: '2026-11-10' }));
    expect(error.getStatus()).toBe(400);
    expect(
      (error.getResponse() as { error: { details: Record<string, string> } }).error.details,
    ).toHaveProperty('paidOn');
    expect(expensesOf()).toHaveLength(0);
    expect((await service.pay(A, billId, { paidOn: '2026-11-09' })).paidOn).toBe('2026-11-09');
  });

  it('two payments at once: one wins, the other is refused, one expense exists', async () => {
    const results = await Promise.allSettled([
      service.pay(A, billId, {}),
      service.pay(A, billId, {}),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(expensesOf()).toHaveLength(1);
  });
});

describe('pay: several bills', () => {
  let ids: string[];
  beforeEach(async () => {
    await add({ name: 'Electricity', dueDay: 5 });
    await add({ name: 'Water', dueDay: 6, expectedAmountMkd: 800 });
    await add({ name: 'Rent', dueDay: 7, expectedAmountMkd: 20_000 });
    await service.sync(A);
    ids = (await service.list(A, '2026-11')).bills.map((b) => b.id);
  });

  it('pays every bill on the day, each for its own amount, in the order given', async () => {
    const { bills } = await service.payMany(A, {
      billIds: [ids[2]!, ids[0]!],
      paidOn: '2026-11-07',
    });
    expect(bills.map((b) => [b.obligationName, b.amountMkd, b.paidOn, b.status])).toEqual([
      ['Rent', 20_000, '2026-11-07', 'paid'],
      ['Electricity', 4_500, '2026-11-07', 'paid'],
    ]);
    expect(expensesOf()).toHaveLength(2);
    expect((await service.inbox(A, 'due')).counts.paid).toBe(2);
  });

  it('defaults to today and uses actual amounts that were entered', async () => {
    await service.update(A, ids[1]!, { actualAmountMkd: 950 });
    const { bills } = await service.payMany(A, { billIds: ids });
    expect(bills.map((b) => b.amountMkd)).toEqual([4_500, 950, 20_000]);
    expect(new Set(bills.map((b) => b.paidOn))).toEqual(new Set(['2026-11-08']));
  });

  it('pays all or none: one already paid bill stops the whole payment', async () => {
    await service.pay(A, ids[1]!, {});
    const error = await failure(service.payMany(A, { billIds: ids }));
    expect(error.getStatus()).toBe(409);
    expect(expensesOf()).toHaveLength(1);
    expect((await billOf('Electricity', '2026-11')).status).toBe('overdue');
    expect((await billOf('Rent', '2026-11')).status).toBe('overdue');
  });

  it('pays all or none: one unknown bill stops the whole payment', async () => {
    const error = await failure(service.payMany(A, { billIds: [ids[0]!, 'nope'] }));
    expect(error.getStatus()).toBe(404);
    expect(expensesOf()).toHaveLength(0);
  });

  it("pays all or none: another user's bill is not found and nothing is paid", async () => {
    await add({ name: 'Theirs' }, B);
    await service.sync(B);
    const theirs = (await service.list(B, '2026-11')).bills[0]!.id;
    const error = await failure(service.payMany(A, { billIds: [ids[0]!, theirs] }));
    expect(error.getStatus()).toBe(404);
    expect(expensesOf()).toHaveLength(0);
    expect(expensesOf(B)).toHaveLength(0);
  });

  it('refuses the same bill twice without paying anything', async () => {
    const error = await failure(service.payMany(A, { billIds: [ids[0]!, ids[0]!] }));
    expect(error.getStatus()).toBe(409);
    expect(expensesOf()).toHaveLength(0);
  });

  it('refuses a day more than a day ahead', async () => {
    const error = await failure(service.payMany(A, { billIds: ids, paidOn: '2026-12-01' }));
    expect(error.getStatus()).toBe(400);
    expect(expensesOf()).toHaveLength(0);
  });
});

describe('undoPayment', () => {
  let billId: string;
  beforeEach(async () => {
    await add({ dueDay: 5 });
    await service.sync(A);
    billId = (await billOf('Electricity', '2026-11')).id;
  });

  it('opens the bill again and deletes the expense', async () => {
    await service.update(A, billId, { actualAmountMkd: 4_820, invoiceRef: 'INV-1' });
    await service.pay(A, billId, {});
    const reopened = await service.undoPayment(A, billId);
    expect(reopened).toMatchObject({
      id: billId,
      status: 'overdue',
      paidOn: null,
      transactionId: null,
      amountMkd: 4_820,
      actualAmountMkd: 4_820,
      invoiceRef: 'INV-1',
    });
    expect(expensesOf()).toHaveLength(0);
    expect((await service.inbox(A, 'paid')).counts.paid).toBe(0);
  });

  it('lets the bill be paid again, with a new expense', async () => {
    const first = await service.pay(A, billId, {});
    await service.undoPayment(A, billId);
    const second = await service.pay(A, billId, { amountMkd: 4_000 });
    expect(second.transactionId).not.toBe(first.transactionId);
    expect(expensesOf()).toHaveLength(1);
    expect(expensesOf()[0]!.amountMkd).toBe(4_000);
  });

  it('refuses a bill that is not paid', async () => {
    expect((await failure(service.undoPayment(A, billId))).getStatus()).toBe(409);
  });

  it('refuses an unknown bill', async () => {
    expect((await failure(service.undoPayment(A, 'nope'))).getStatus()).toBe(404);
  });

  it("refuses another user's bill and leaves their payment alone", async () => {
    await service.pay(A, billId, {});
    expect((await failure(service.undoPayment(B, billId))).getStatus()).toBe(404);
    expect(expensesOf()).toHaveLength(1);
    expect((await billOf('Electricity', '2026-11')).status).toBe('paid');
  });

  it('only removes the expense of that bill', async () => {
    await add({ name: 'Water', dueDay: 6 });
    await service.sync(A);
    const water = await billOf('Water', '2026-11');
    await service.pay(A, water.id, {});
    await service.pay(A, billId, {});
    await service.undoPayment(A, billId);
    expect(expensesOf()).toHaveLength(1);
    expect((await billOf('Water', '2026-11')).status).toBe('paid');
  });
});

describe('update: actual amount and invoice reference', () => {
  let billId: string;
  beforeEach(async () => {
    await add();
    await service.sync(A);
    billId = (await billOf('Electricity', '2026-11')).id;
  });

  it('the actual amount replaces the expected one, which stays on record', async () => {
    const updated = await service.update(A, billId, { actualAmountMkd: 4_820 });
    expect(updated).toMatchObject({
      actualAmountMkd: 4_820,
      expectedAmountMkd: 4_500,
      amountMkd: 4_820,
      invoiceRef: null,
    });
    expect(await billOf('Electricity', '2026-11')).toMatchObject({ amountMkd: 4_820 });
  });

  it('stores the invoice reference without touching the amount', async () => {
    const updated = await service.update(A, billId, { invoiceRef: 'INV-2026/118' });
    expect(updated).toMatchObject({
      invoiceRef: 'INV-2026/118',
      actualAmountMkd: null,
      amountMkd: 4_500,
    });
  });

  it('sets both at once', async () => {
    expect(
      await service.update(A, billId, { actualAmountMkd: 5_000, invoiceRef: 'A-1' }),
    ).toMatchObject({
      amountMkd: 5_000,
      invoiceRef: 'A-1',
    });
  });

  it('changing one keeps the other', async () => {
    await service.update(A, billId, { actualAmountMkd: 5_000, invoiceRef: 'A-1' });
    expect(await service.update(A, billId, { invoiceRef: 'A-2' })).toMatchObject({
      amountMkd: 5_000,
      invoiceRef: 'A-2',
    });
    expect(await service.update(A, billId, { actualAmountMkd: 5_100 })).toMatchObject({
      amountMkd: 5_100,
      invoiceRef: 'A-2',
    });
  });

  it('null takes the actual amount and the reference away again', async () => {
    await service.update(A, billId, { actualAmountMkd: 5_000, invoiceRef: 'A-1' });
    expect(await service.update(A, billId, { actualAmountMkd: null })).toMatchObject({
      actualAmountMkd: null,
      amountMkd: 4_500,
      invoiceRef: 'A-1',
    });
    expect(await service.update(A, billId, { invoiceRef: null })).toMatchObject({
      invoiceRef: null,
    });
  });

  it('the actual amount survives a later change of the obligation', async () => {
    const o = (await service.list(A, '2026-11')).bills[0]!.obligationId;
    await service.update(A, billId, { actualAmountMkd: 4_820 });
    await obligationsService.update(A, o, { expectedAmountMkd: 9_999 });
    expect(await billOf('Electricity', '2026-11')).toMatchObject({
      amountMkd: 4_820,
      expectedAmountMkd: 4_500,
    });
  });

  it('refuses a paid bill and leaves it as it was', async () => {
    await service.pay(A, billId, {});
    const error = await failure(service.update(A, billId, { actualAmountMkd: 1 }));
    expect(error.getStatus()).toBe(409);
    expect(await billOf('Electricity', '2026-11')).toMatchObject({
      actualAmountMkd: null,
      amountMkd: 4_500,
    });
  });

  it('refuses an unknown bill', async () => {
    expect((await failure(service.update(A, 'nope', { invoiceRef: 'x' }))).getStatus()).toBe(404);
  });

  it("refuses another user's bill and changes nothing", async () => {
    expect((await failure(service.update(B, billId, { invoiceRef: 'x' }))).getStatus()).toBe(404);
    expect((await billOf('Electricity', '2026-11')).invoiceRef).toBeNull();
  });

  it('answers "already paid" when the bill was paid between the check and the change', async () => {
    vi.spyOn(billsRepository, 'update').mockResolvedValueOnce(null);
    const error = await failure(service.update(A, billId, { invoiceRef: 'x' }));
    expect(error.getStatus()).toBe(409);
  });

  it('answers "not found" when the bill vanished between the check and the change', async () => {
    const record = (await billsRepository.find(A, billId))!;
    vi.spyOn(billsRepository, 'find').mockResolvedValueOnce(record).mockResolvedValueOnce(null);
    vi.spyOn(billsRepository, 'update').mockResolvedValueOnce(null);
    const error = await failure(service.update(A, billId, { invoiceRef: 'x' }));
    expect(error.getStatus()).toBe(404);
  });
});
