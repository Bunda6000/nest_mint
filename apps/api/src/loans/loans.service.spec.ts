import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillsService } from '../bills/bills.service.js';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { ObligationsService } from '../obligations/obligations.service.js';
import { InMemoryBills } from '../testing/bills-fake.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { LoansService } from './loans.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let obligations: InMemoryObligations;
let obligationsService: ObligationsService;
let bills: InMemoryBills;
let billsService: BillsService;
let service: LoansService;
let transactions: InMemoryTransactions;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  const clock = new FakeClock(); // 2026-11-08
  const nameOf = (userId: string, id: string) =>
    categories.categories.find((c) => c.userId === userId && c.id === id)!.name;
  obligations = new InMemoryObligations(nameOf, () => clock.now().toISOString().slice(0, 7));
  transactions = new InMemoryTransactions(nameOf);
  obligationsService = new ObligationsService(obligations, categories);
  bills = new InMemoryBills(obligations, transactions);
  billsService = new BillsService(bills, obligations, clock);
  service = new LoansService(obligations, bills, transactions, clock);
});

const categoryId = (name: string, user = A): string =>
  categories.categories.find((c) => c.userId === user && c.name === name)!.id;

const loan = (over: Record<string, unknown> = {}, user = A) =>
  obligationsService.createLoan(user, {
    name: 'Mortgage',
    lender: 'Komercijalna Banka',
    loanType: 'housing',
    principalMkd: 1_200_000,
    annualRateBp: 600,
    categoryId: categoryId('Electricity', user),
    dueDay: 5,
    startMonth: '2026-01',
    endMonth: '2027-06',
    monthlyPaymentMkd: 15_500,
    ...over,
  } as never);

const change = (over: Record<string, unknown> = {}) =>
  ({ effectiveMonth: '2026-10', annualRateBp: 700, monthlyPaymentMkd: 16_000, ...over }) as never;

const amounts = async (month: string) =>
  (await billsService.list(A, month)).bills.map((b) => b.expectedAmountMkd);

async function failure(call: Promise<unknown>): Promise<HttpException> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const detailsOf = (error: HttpException) =>
  (error.getResponse() as { error: { details: Record<string, string> } }).error.details;

describe('changeRate: the loan', () => {
  it('stores the change on the loan and keeps its first terms', async () => {
    const saved = await loan();
    const updated = await service.changeRate(A, saved.id, change());
    expect(updated.expectedAmountMkd).toBe(15_500);
    expect(updated.loan).toMatchObject({
      annualRateBp: 600,
      rateChanges: [{ effectiveMonth: '2026-10', annualRateBp: 700, monthlyPaymentMkd: 16_000 }],
    });
  });

  it('lists the changes oldest first and replaces a second change for the same month', async () => {
    const saved = await loan();
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2027-03' }));
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-10' }));
    const fixed = await service.changeRate(
      A,
      saved.id,
      change({ effectiveMonth: '2026-10', annualRateBp: 650, monthlyPaymentMkd: 15_800 }),
    );
    expect(fixed.loan!.rateChanges).toEqual([
      { effectiveMonth: '2026-10', annualRateBp: 650, monthlyPaymentMkd: 15_800 },
      { effectiveMonth: '2027-03', annualRateBp: 700, monthlyPaymentMkd: 16_000 },
    ]);
  });

  it('accepts the first and the last month of the loan', async () => {
    const saved = await loan();
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-01' }));
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2027-06' }));
    expect((await obligations.find(A, saved.id))!.loan!.rateChanges).toHaveLength(2);
  });
});

describe('changeRate: the bills', () => {
  async function threeBills() {
    const saved = await loan();
    for (const month of ['2026-09', '2026-10', '2026-11', '2026-12']) {
      await billsService.generate(A, month);
    }
    return saved;
  }

  it('gives unpaid bills from the effective month on the new payment, and leaves earlier ones', async () => {
    const saved = await threeBills();
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-11' }));
    expect(await amounts('2026-09')).toEqual([15_500]);
    expect(await amounts('2026-10')).toEqual([15_500]);
    expect(await amounts('2026-11')).toEqual([16_000]);
    expect(await amounts('2026-12')).toEqual([16_000]);
  });

  it('leaves a paid bill alone even from the effective month on', async () => {
    const saved = await threeBills();
    const october = (await billsService.list(A, '2026-10')).bills[0]!;
    await billsService.pay(A, october.id, {});
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-10' }));
    expect(await amounts('2026-10')).toEqual([15_500]);
    expect(await amounts('2026-11')).toEqual([16_000]);
  });

  it('keeps an invoice amount that was already entered', async () => {
    const saved = await threeBills();
    const november = (await billsService.list(A, '2026-11')).bills[0]!;
    await billsService.update(A, november.id, { actualAmountMkd: 15_730 });
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-11' }));
    const after = (await billsService.list(A, '2026-11')).bills[0]!;
    expect(after.actualAmountMkd).toBe(15_730);
    expect(after.amountMkd).toBe(15_730);
    expect(after.expectedAmountMkd).toBe(16_000);
  });

  it('gives each bill the payment in force for its month when there are several changes', async () => {
    const saved = await threeBills();
    await service.changeRate(
      A,
      saved.id,
      change({ effectiveMonth: '2026-12', monthlyPaymentMkd: 17_000 }),
    );
    await service.changeRate(
      A,
      saved.id,
      change({ effectiveMonth: '2026-10', monthlyPaymentMkd: 16_000 }),
    );
    expect(await amounts('2026-09')).toEqual([15_500]);
    expect(await amounts('2026-10')).toEqual([16_000]);
    expect(await amounts('2026-11')).toEqual([16_000]);
    expect(await amounts('2026-12')).toEqual([17_000]);
  });

  it('creates later bills with the payment in force that month, not the change that comes after', async () => {
    const saved = await loan();
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-12' }));
    await billsService.generate(A, '2026-11');
    await billsService.generate(A, '2026-12');
    expect(await amounts('2026-11')).toEqual([15_500]);
    expect(await amounts('2026-12')).toEqual([16_000]);
  });

  it('does not touch the bills of another obligation or another user', async () => {
    const mine = await loan();
    const other = await loan({ name: 'Car loan' });
    const theirs = await loan({}, B);
    for (const month of ['2026-11']) {
      await billsService.generate(A, month);
      await billsService.generate(B, month);
    }
    await service.changeRate(A, mine.id, change({ effectiveMonth: '2026-11' }));
    const forOther = bills.rows.find((r) => r.obligationId === other.id)!;
    const forTheirs = bills.rows.find((r) => r.obligationId === theirs.id)!;
    expect(forOther.expectedAmountMkd).toBe(15_500);
    expect(forTheirs.expectedAmountMkd).toBe(15_500);
  });
});

describe('changeRate: refusals', () => {
  it('answers "not found" for an unknown id and for another user\'s loan, changing nothing', async () => {
    const saved = await loan();
    expect((await failure(service.changeRate(A, 'nope', change()))).getStatus()).toBe(404);
    expect((await failure(service.changeRate(B, saved.id, change()))).getStatus()).toBe(404);
    expect((await obligations.find(A, saved.id))!.loan!.rateChanges).toEqual([]);
  });

  it('refuses a plain bill with a conflict', async () => {
    const bill = await obligationsService.create(A, {
      recurrence: 'monthly',
      name: 'Water',
      categoryId: categoryId('Water'),
      expectedAmountMkd: 1_200,
      dueDay: 10,
      startMonth: '2026-01',
    } as never);
    expect((await failure(service.changeRate(A, bill.id, change()))).getStatus()).toBe(409);
  });

  it('refuses a month before the first or after the last month of the loan', async () => {
    const saved = await loan();
    for (const effectiveMonth of ['2025-12', '2027-07']) {
      const error = await failure(service.changeRate(A, saved.id, change({ effectiveMonth })));
      expect(error.getStatus()).toBe(400);
      expect(detailsOf(error)).toHaveProperty('effectiveMonth');
    }
    expect((await obligations.find(A, saved.id))!.loan!.rateChanges).toEqual([]);
  });
});

describe('extra payments', () => {
  // 120,000 at 0 %: twelve payments of 10,000 in 2026. Easy to follow by hand.
  const simple = (over: Record<string, unknown> = {}) =>
    loan({
      principalMkd: 120_000,
      annualRateBp: 0,
      monthlyPaymentMkd: 10_000,
      startMonth: '2026-01',
      endMonth: '2026-12',
      ...over,
    });
  const extra = (over: Record<string, unknown> = {}) =>
    ({ paidOn: '2026-05-10', amountMkd: 20_000, effect: 'shorten', ...over }) as never;
  const generateFrom = async (months: string[]) => {
    for (const m of months) await billsService.generate(A, m);
  };

  it('shorten: saves the expense and the payment, ends the loan earlier and removes later bills', async () => {
    const saved = await simple();
    await generateFrom(['2026-09', '2026-10', '2026-11', '2026-12']);
    const updated = await service.addExtraPayment(A, saved.id, extra());

    expect(updated.endMonth).toBe('2026-10');
    expect(updated.loan!.extraPayments).toEqual([
      expect.objectContaining({ paidOn: '2026-05-10', amountMkd: 20_000, kind: 'extra' }),
    ]);
    const expense = transactions.rows.find((t) => t.amountMkd === 20_000)!;
    expect(expense).toMatchObject({ occurredOn: '2026-05-10', kind: 'expense' });
    expect(expense.note).toBe('Extra payment · Mortgage');
    expect(await amounts('2026-10')).toEqual([10_000]);
    expect(await amounts('2026-11')).toEqual([]);
    expect(await amounts('2026-12')).toEqual([]);
  });

  it('shorten: the last bill takes what is left, and paid bills stay', async () => {
    const saved = await simple();
    await generateFrom(['2026-09', '2026-10', '2026-11']);
    const september = (await billsService.list(A, '2026-09')).bills[0]!;
    await billsService.pay(A, september.id, {});
    // 15,000 less to pay: Jan–Aug 80,000, owed 40,000 at Sept; with this extra it ends in Sept? no: Oct.
    const updated = await service.addExtraPayment(A, saved.id, extra({ amountMkd: 25_000 }));
    expect(updated.endMonth).toBe('2026-10');
    expect(await amounts('2026-09')).toEqual([10_000]);
    expect(await amounts('2026-10')).toEqual([5_000]);
    expect(await amounts('2026-11')).toEqual([]);
  });

  it('lower_payment: keeps the end date and takes the typed payment from the next month', async () => {
    const saved = await simple();
    await generateFrom(['2026-09', '2026-10']);
    const updated = await service.addExtraPayment(
      A,
      saved.id,
      extra({ effect: 'lower_payment', newMonthlyPaymentMkd: 6_000 }),
    );
    expect(updated.endMonth).toBe('2026-12');
    expect(updated.loan!.rateChanges).toEqual([
      { effectiveMonth: '2026-06', annualRateBp: 0, monthlyPaymentMkd: 6_000 },
    ]);
    expect(await amounts('2026-09')).toEqual([6_000]);
    expect(await amounts('2026-10')).toEqual([6_000]);
  });

  it('lower_payment keeps the rate in force at that time', async () => {
    const saved = await simple({ annualRateBp: 600 });
    await service.changeRate(A, saved.id, change({ effectiveMonth: '2026-03', annualRateBp: 750 }));
    const updated = await service.addExtraPayment(
      A,
      saved.id,
      extra({ effect: 'lower_payment', newMonthlyPaymentMkd: 9_000 }),
    );
    expect(updated.loan!.rateChanges.find((c) => c.effectiveMonth === '2026-06')).toMatchObject({
      annualRateBp: 750,
      monthlyPaymentMkd: 9_000,
    });
  });

  it('none: records the payment and the expense and leaves the bills and dates alone', async () => {
    const saved = await simple();
    await generateFrom(['2026-11', '2026-12']);
    const updated = await service.addExtraPayment(A, saved.id, extra({ effect: 'none' }));
    expect(updated.endMonth).toBe('2026-12');
    expect(updated.loan!.extraPayments).toHaveLength(1);
    expect(transactions.rows).toHaveLength(1);
    expect(await amounts('2026-12')).toEqual([10_000]);
  });

  it('refuses an amount that pays off everything, saving nothing', async () => {
    const saved = await simple();
    const error = await failure(service.addExtraPayment(A, saved.id, extra({ amountMkd: 70_000 })));
    expect(error.getStatus()).toBe(400);
    expect(detailsOf(error)).toHaveProperty('amountMkd');
    expect(transactions.rows).toHaveLength(0);
    expect((await obligations.find(A, saved.id))!.loan!.extraPayments).toEqual([]);
  });

  it('refuses a future day and a day outside the loan', async () => {
    const saved = await simple();
    const future = await failure(
      service.addExtraPayment(A, saved.id, extra({ paidOn: '2026-12-20' })),
    );
    expect(detailsOf(future)).toHaveProperty('paidOn');
    const before = await failure(
      service.addExtraPayment(A, saved.id, extra({ paidOn: '2025-12-20' })),
    );
    expect(detailsOf(before)).toHaveProperty('paidOn');
    expect(transactions.rows).toHaveLength(0);
  });

  it("answers 404 for another user's loan and 409 for a plain bill", async () => {
    const saved = await simple();
    expect((await failure(service.addExtraPayment(B, saved.id, extra()))).getStatus()).toBe(404);
    const plain = await obligationsService.create(A, {
      recurrence: 'monthly',
      name: 'Water',
      categoryId: categoryId('Water'),
      expectedAmountMkd: 1_000,
      dueDay: 3,
      startMonth: '2026-01',
    } as never);
    expect((await failure(service.addExtraPayment(A, plain.id, extra()))).getStatus()).toBe(409);
  });
});

describe('payOff', () => {
  const simple = () =>
    loan({
      principalMkd: 120_000,
      annualRateBp: 0,
      monthlyPaymentMkd: 10_000,
      startMonth: '2026-01',
      endMonth: '2026-12',
    });
  const payoff = (over: Record<string, unknown> = {}) =>
    ({ paidOn: '2026-11-05', amountMkd: 20_000, ...over }) as never;

  it('saves the expense and the payoff, ends the loan that month and removes unpaid bills from it', async () => {
    const saved = await simple();
    for (const m of ['2026-09', '2026-10', '2026-11', '2026-12']) await billsService.generate(A, m);
    const september = (await billsService.list(A, '2026-09')).bills[0]!;
    await billsService.pay(A, september.id, {});

    const updated = await service.payOff(A, saved.id, payoff());
    expect(updated.endMonth).toBe('2026-11');
    expect(updated.loan!.extraPayments).toEqual([
      expect.objectContaining({ paidOn: '2026-11-05', amountMkd: 20_000, kind: 'payoff' }),
    ]);
    expect(transactions.rows.find((t) => t.amountMkd === 20_000)!.note).toBe(
      'Loan payoff · Mortgage',
    );
    expect(await amounts('2026-09')).toEqual([10_000]);
    expect(await amounts('2026-10')).toEqual([10_000]);
    expect(await amounts('2026-11')).toEqual([]);
    expect(await amounts('2026-12')).toEqual([]);
  });

  it('keeps a bill of that month that was already paid', async () => {
    const saved = await simple();
    await billsService.generate(A, '2026-11');
    const november = (await billsService.list(A, '2026-11')).bills[0]!;
    await billsService.pay(A, november.id, {});
    await service.payOff(A, saved.id, payoff());
    expect(await amounts('2026-11')).toEqual([10_000]);
  });

  it('can only happen once, and no extra payment follows it', async () => {
    const saved = await simple();
    await service.payOff(A, saved.id, payoff());
    expect((await failure(service.payOff(A, saved.id, payoff()))).getStatus()).toBe(409);
    expect(
      (
        await failure(
          service.addExtraPayment(A, saved.id, {
            paidOn: '2026-05-10',
            amountMkd: 1_000,
            effect: 'none',
          } as never),
        )
      ).getStatus(),
    ).toBe(409);
  });

  it('refuses a future day or one outside the loan, saving nothing; 404 for other users', async () => {
    const saved = await simple();
    for (const paidOn of ['2026-12-25', '2025-12-31']) {
      const error = await failure(service.payOff(A, saved.id, payoff({ paidOn })));
      expect(detailsOf(error)).toHaveProperty('paidOn');
    }
    expect((await failure(service.payOff(B, saved.id, payoff()))).getStatus()).toBe(404);
    expect(transactions.rows).toHaveLength(0);
    expect((await obligations.find(A, saved.id))!.endMonth).toBe('2026-12');
  });
});
