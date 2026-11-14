import { HttpException } from '@nestjs/common';
import { MAX_LOAN_RATE_BP as ENGINE_MAX_LOAN_RATE_BP } from '@nestmint/finance-engine';
import { END_BEFORE_START, ErrorCode, MAX_LOAN_RATE_BP } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { InMemoryCategories } from '../testing/fakes.js';
import { InMemoryObligations } from '../testing/obligations-fake.js';
import { ObligationsService } from './obligations.service.js';

const A = 'user-a';
const B = 'user-b';

let categories: InMemoryCategories;
let repository: InMemoryObligations;
let service: ObligationsService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(A, DEFAULT_CATEGORY_GROUPS);
  await categories.seedDefaultsOnce(B, DEFAULT_CATEGORY_GROUPS);
  repository = new InMemoryObligations(
    (userId, id) => categories.categories.find((c) => c.userId === userId && c.id === id)!.name,
  );
  service = new ObligationsService(repository, categories);
});

const categoryId = (name: string, user = A): string =>
  categories.categories.find((c) => c.userId === user && c.name === name)!.id;

const monthly = (name = 'Electricity', over: Record<string, unknown> = {}) =>
  ({
    recurrence: 'monthly',
    name,
    payee: 'EVN',
    categoryId: categoryId('Electricity'),
    expectedAmountMkd: 4_500,
    dueDay: 15,
    startMonth: '2026-01',
    ...over,
  }) as never;

const everyN = (name = 'Insurance', over: Record<string, unknown> = {}) =>
  monthly(name, { recurrence: 'every_n_months', everyNMonths: 3, ...over });

const custom = (name = 'Heating', over: Record<string, unknown> = {}) =>
  monthly(name, { recurrence: 'custom_months', months: [11, 12, 1, 2, 3], ...over });

async function failure(call: Promise<unknown>): Promise<HttpException> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const codeOf = (error: HttpException) =>
  (error.getResponse() as { error: { code: string } }).error.code;
const detailsOf = (error: HttpException) =>
  (error.getResponse() as { error: { details: Record<string, string> } }).error.details;

describe('create', () => {
  it('saves a monthly bill and answers with the category name', async () => {
    const saved = await service.create(A, monthly());
    expect(saved).toMatchObject({
      name: 'Electricity',
      payee: 'EVN',
      categoryId: categoryId('Electricity'),
      categoryName: 'Electricity',
      expectedAmountMkd: 4_500,
      dueDay: 15,
      recurrence: 'monthly',
      everyNMonths: null,
      months: null,
      startMonth: '2026-01',
      endMonth: null,
    });
    expect(saved.id).toBeTruthy();
  });

  it('keeps the schedule fields that belong to the recurrence and no others', async () => {
    const n = await service.create(A, everyN());
    expect(n).toMatchObject({ recurrence: 'every_n_months', everyNMonths: 3, months: null });
    const c = await service.create(A, custom());
    expect(c).toMatchObject({
      recurrence: 'custom_months',
      everyNMonths: null,
      months: [11, 12, 1, 2, 3],
    });
  });

  it('saves no payee as null and keeps an end month', async () => {
    const saved = await service.create(
      A,
      monthly('Water', { payee: undefined, endMonth: '2026-12' }),
    );
    expect(saved).toMatchObject({ payee: null, endMonth: '2026-12' });
  });

  it('refuses another user\'s category as "not found" and saves nothing', async () => {
    const error = await failure(
      service.create(A, monthly('X', { categoryId: categoryId('Electricity', B) })),
    );
    expect(error.getStatus()).toBe(404);
    expect(codeOf(error)).toBe(ErrorCode.NotFound);
    expect(repository.rows).toHaveLength(0);
  });

  it('refuses an archived category as a conflict', async () => {
    const id = categoryId('Electricity');
    await categories.updateCategory(A, id, { archived: true });
    const error = await failure(service.create(A, monthly()));
    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe(ErrorCode.Conflict);
    expect(repository.rows).toHaveLength(0);
  });
});

describe('list', () => {
  it('lists by name, ignoring case', async () => {
    await service.create(A, monthly('water'));
    await service.create(A, monthly('Electricity'));
    await service.create(A, monthly('Internet'));
    const { obligations } = await service.list(A);
    expect(obligations.map((o) => o.name)).toEqual(['Electricity', 'Internet', 'water']);
  });

  it("shows only the user's own obligations", async () => {
    await service.create(A, monthly('Mine'));
    await service.create(B, monthly('Theirs', { categoryId: categoryId('Electricity', B) }));
    expect((await service.list(A)).obligations.map((o) => o.name)).toEqual(['Mine']);
    expect((await service.list(B)).obligations.map((o) => o.name)).toEqual(['Theirs']);
  });

  it('is empty for a new user', async () => {
    expect(await service.list('nobody')).toEqual({ obligations: [] });
  });
});

describe('update', () => {
  it('changes only what was sent', async () => {
    const saved = await service.create(A, monthly());
    const updated = await service.update(A, saved.id, { expectedAmountMkd: 5_200, dueDay: 20 });
    expect(updated).toMatchObject({
      name: 'Electricity',
      payee: 'EVN',
      expectedAmountMkd: 5_200,
      dueDay: 20,
      startMonth: '2026-01',
    });
  });

  it('moves to another active category and clears the payee', async () => {
    const saved = await service.create(A, monthly());
    const updated = await service.update(A, saved.id, {
      categoryId: categoryId('Phone & internet'),
      payee: null,
    });
    expect(updated).toMatchObject({ categoryName: 'Phone & internet', payee: null });
  });

  it('keeps the same category even when it was archived since', async () => {
    const saved = await service.create(A, monthly());
    await categories.updateCategory(A, categoryId('Electricity'), { archived: true });
    const updated = await service.update(A, saved.id, {
      categoryId: categoryId('Electricity'),
      dueDay: 3,
    });
    expect(updated.dueDay).toBe(3);
  });

  it("refuses a move to an archived category, and to another user's", async () => {
    const saved = await service.create(A, monthly());
    await categories.updateCategory(A, categoryId('Phone & internet'), { archived: true });
    const archived = await failure(
      service.update(A, saved.id, { categoryId: categoryId('Phone & internet') }),
    );
    expect(archived.getStatus()).toBe(409);
    const foreign = await failure(
      service.update(A, saved.id, { categoryId: categoryId('Phone & internet', B) }),
    );
    expect(foreign.getStatus()).toBe(404);
    expect((await service.list(A)).obligations[0]!.categoryName).toBe('Electricity');
  });

  it('changes n for bills every few months and months for chosen months', async () => {
    const n = await service.create(A, everyN());
    expect(await service.update(A, n.id, { everyNMonths: 6 })).toMatchObject({ everyNMonths: 6 });
    const c = await service.create(A, custom());
    expect(await service.update(A, c.id, { months: [12, 1] })).toMatchObject({ months: [12, 1] });
  });

  it('refuses n on other recurrences and months on other recurrences', async () => {
    const m = await service.create(A, monthly());
    const c = await service.create(A, custom());
    const n = await service.create(A, everyN());
    for (const [id, change, field] of [
      [m.id, { everyNMonths: 3 }, 'everyNMonths'],
      [c.id, { everyNMonths: 3 }, 'everyNMonths'],
      [m.id, { months: [1] }, 'months'],
      [n.id, { months: [1] }, 'months'],
    ] as const) {
      const error = await failure(service.update(A, id, change as never));
      expect(error.getStatus()).toBe(400);
      expect(Object.keys(detailsOf(error))).toEqual([field]);
    }
  });

  it('refuses an end before the start, whichever one is changed', async () => {
    const saved = await service.create(
      A,
      monthly('X', { startMonth: '2026-03', endMonth: '2026-06' }),
    );
    const endError = await failure(service.update(A, saved.id, { endMonth: '2026-02' }));
    expect(detailsOf(endError)).toEqual({ endMonth: END_BEFORE_START });
    const startError = await failure(service.update(A, saved.id, { startMonth: '2026-07' }));
    expect(detailsOf(startError)).toEqual({ startMonth: END_BEFORE_START });
    expect(await service.update(A, saved.id, { startMonth: '2026-06' })).toMatchObject({
      startMonth: '2026-06',
    });
  });

  it('takes the end away with null, and sets one on an open-ended bill', async () => {
    const saved = await service.create(A, monthly('X', { endMonth: '2026-06' }));
    expect(await service.update(A, saved.id, { endMonth: null })).toMatchObject({ endMonth: null });
    expect(await service.update(A, saved.id, { endMonth: '2027-01' })).toMatchObject({
      endMonth: '2027-01',
    });
  });

  it('answers "not found" for another user\'s obligation and changes nothing', async () => {
    const saved = await service.create(A, monthly());
    const error = await failure(service.update(B, saved.id, { name: 'Hijacked' }));
    expect(error.getStatus()).toBe(404);
    expect((await service.list(A)).obligations[0]!.name).toBe('Electricity');
  });

  it('answers "not found" for an unknown id', async () => {
    const error = await failure(service.update(A, 'nope', { name: 'X' }));
    expect(error.getStatus()).toBe(404);
  });
});

describe('createLoan', () => {
  const loan = (over: Record<string, unknown> = {}) =>
    ({
      name: 'Mortgage',
      lender: 'Komercijalna Banka',
      loanType: 'housing',
      principalMkd: 1_000_000,
      annualRateBp: 600,
      categoryId: categoryId('Electricity'),
      dueDay: 5,
      startMonth: '2026-01',
      endMonth: '2035-12',
      ...over,
    }) as never;

  it('works out the monthly payment as an annuity when none is given', async () => {
    const saved = await service.createLoan(A, loan());
    expect(saved).toMatchObject({
      name: 'Mortgage',
      payee: 'Komercijalna Banka',
      recurrence: 'monthly',
      expectedAmountMkd: 11_102,
      dueDay: 5,
      startMonth: '2026-01',
      endMonth: '2035-12',
      kind: 'loan',
      loan: { loanType: 'housing', principalMkd: 1_000_000, annualRateBp: 600 },
    });
  });

  it("keeps the bank's payment when one is given", async () => {
    const saved = await service.createLoan(A, loan({ monthlyPaymentMkd: 19_500 }));
    expect(saved.expectedAmountMkd).toBe(19_500);
  });

  it('splits the principal evenly at 0 %', async () => {
    const saved = await service.createLoan(
      A,
      loan({ principalMkd: 120_000, annualRateBp: 0, endMonth: '2026-12' }),
    );
    expect(saved.expectedAmountMkd).toBe(10_000);
  });

  it('asks for the payment when the calculation comes out below one denar', async () => {
    const error = await failure(
      service.createLoan(A, loan({ principalMkd: 1, annualRateBp: 0, endMonth: '2030-12' })),
    );
    expect(error.getStatus()).toBe(400);
    expect(detailsOf(error)).toHaveProperty('monthlyPaymentMkd');
  });

  it('lists a loan next to the bills and a plain bill has no loan details', async () => {
    await service.create(A, monthly());
    await service.createLoan(A, loan());
    const { obligations } = await service.list(A);
    expect(obligations.map((o) => [o.name, o.kind, o.loan !== null])).toEqual([
      ['Electricity', 'bill', false],
      ['Mortgage', 'loan', true],
    ]);
  });

  it("refuses an archived category (409) and another user's category (404)", async () => {
    const other = await failure(
      service.createLoan(A, loan({ categoryId: categoryId('Electricity', B) })),
    );
    expect(other.getStatus()).toBe(404);

    const id = categoryId('Water');
    await categories.updateCategory(A, id, { archived: true });
    const archived = await failure(service.createLoan(A, loan({ categoryId: id })));
    expect(archived.getStatus()).toBe(409);
    expect(codeOf(archived)).toBe(ErrorCode.Conflict);
  });

  it('uses the same highest rate in the engine and in the API schema', () => {
    expect(ENGINE_MAX_LOAN_RATE_BP).toBe(MAX_LOAN_RATE_BP);
  });
});
