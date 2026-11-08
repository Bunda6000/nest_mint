import { HttpException } from '@nestjs/common';
import { END_BEFORE_START, ErrorCode } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryIncome } from '../testing/income-fake.js';
import { IncomeService } from './income.service.js';

const A = 'user-a';
const B = 'user-b';

let repository: InMemoryIncome;
let service: IncomeService;

beforeEach(() => {
  repository = new InMemoryIncome();
  service = new IncomeService(repository);
});

const salary = (over: Record<string, unknown> = {}) =>
  ({
    recurrence: 'monthly',
    name: 'Salary',
    amountMkd: 120_000,
    startMonth: '2026-01',
    payDay: 25,
    ...over,
  }) as never;

const bonus = (over: Record<string, unknown> = {}) =>
  ({
    recurrence: 'one_off',
    name: 'Bonus',
    amountMkd: 30_000,
    receivedOn: '2026-11-03',
    ...over,
  }) as never;

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
  it('saves a monthly salary with only its own fields', async () => {
    const saved = await service.create(A, salary());
    expect(saved).toEqual({
      id: expect.any(String),
      name: 'Salary',
      amountMkd: 120_000,
      recurrence: 'monthly',
      receivedOn: null,
      startMonth: '2026-01',
      endMonth: null,
      payDay: 25,
    });
  });

  it('keeps an end month when one is given', async () => {
    expect((await service.create(A, salary({ endMonth: '2026-10' }))).endMonth).toBe('2026-10');
  });

  it('saves one-off income with only its own fields', async () => {
    expect(await service.create(A, bonus())).toEqual({
      id: expect.any(String),
      name: 'Bonus',
      amountMkd: 30_000,
      recurrence: 'one_off',
      receivedOn: '2026-11-03',
      startMonth: null,
      endMonth: null,
      payDay: null,
    });
  });
});

describe('list', () => {
  it('is empty at first', async () => {
    expect(await service.list(A)).toEqual({ incomes: [] });
  });

  it('puts the newest start first, mixing monthly and one-off income', async () => {
    await service.create(
      A,
      salary({ name: 'Old job', startMonth: '2024-03', endMonth: '2025-12' }),
    );
    await service.create(A, bonus({ name: 'Refund', receivedOn: '2026-05-10' }));
    await service.create(A, salary({ name: 'New job', startMonth: '2026-01' }));
    await service.create(A, bonus({ name: 'Bonus', receivedOn: '2026-11-03' }));

    expect((await service.list(A)).incomes.map((i) => i.name)).toEqual([
      'Bonus',
      'Refund',
      'New job',
      'Old job',
    ]);
  });

  it('keeps the newest entered first when two start together', async () => {
    await service.create(A, bonus({ name: 'First', receivedOn: '2026-05-10' }));
    await service.create(A, bonus({ name: 'Second', receivedOn: '2026-05-10' }));
    expect((await service.list(A)).incomes.map((i) => i.name)).toEqual(['Second', 'First']);
  });

  it("shows only the user's own income", async () => {
    await service.create(A, salary({ amountMkd: 111 }));
    await service.create(B, salary({ amountMkd: 222 }));
    expect((await service.list(A)).incomes.map((i) => i.amountMkd)).toEqual([111]);
    expect((await service.list(B)).incomes.map((i) => i.amountMkd)).toEqual([222]);
  });
});

describe('update', () => {
  it('changes only what was sent', async () => {
    const saved = await service.create(A, salary());
    expect(await service.update(A, saved.id, { amountMkd: 130_000 })).toEqual({
      ...saved,
      amountMkd: 130_000,
    });
  });

  it('ends a salary, and takes the end away again', async () => {
    const saved = await service.create(A, salary());
    expect((await service.update(A, saved.id, { endMonth: '2026-12' })).endMonth).toBe('2026-12');
    expect((await service.update(A, saved.id, { endMonth: null })).endMonth).toBeNull();
  });

  it('changes the date of one-off income', async () => {
    const saved = await service.create(A, bonus());
    expect((await service.update(A, saved.id, { receivedOn: '2026-11-05' })).receivedOn).toBe(
      '2026-11-05',
    );
  });

  it('refuses monthly fields on one-off income, naming each', async () => {
    const saved = await service.create(A, bonus());
    const error = await failure(service.update(A, saved.id, { payDay: 5, endMonth: '2026-12' }));
    expect(error.getStatus()).toBe(400);
    expect(codeOf(error)).toBe(ErrorCode.ValidationFailed);
    expect(detailsOf(error)).toEqual({
      endMonth: 'Only for monthly income',
      payDay: 'Only for monthly income',
    });
  });

  it('refuses a date on monthly income', async () => {
    const saved = await service.create(A, salary());
    const error = await failure(service.update(A, saved.id, { receivedOn: '2026-11-05' }));
    expect(detailsOf(error)).toEqual({ receivedOn: 'Only for one-off income' });
  });

  it('refuses an end before the start, whichever of the two is changed', async () => {
    const saved = await service.create(A, salary({ startMonth: '2026-03', endMonth: '2026-08' }));
    const early = await failure(service.update(A, saved.id, { endMonth: '2026-02' }));
    expect(detailsOf(early)).toEqual({ endMonth: END_BEFORE_START });
    const late = await failure(service.update(A, saved.id, { startMonth: '2026-09' }));
    expect(detailsOf(late)).toEqual({ startMonth: END_BEFORE_START });
    // Changing both at once to a valid pair is fine; the same month is fine.
    const both = await service.update(A, saved.id, { startMonth: '2026-09', endMonth: '2026-09' });
    expect(both).toMatchObject({ startMonth: '2026-09', endMonth: '2026-09' });
    expect((await service.list(A)).incomes[0]).toMatchObject({ startMonth: '2026-09' });
  });

  it('accepts a start after an end that was removed in the same change', async () => {
    const saved = await service.create(A, salary({ startMonth: '2026-03', endMonth: '2026-08' }));
    const updated = await service.update(A, saved.id, { startMonth: '2026-11', endMonth: null });
    expect(updated).toMatchObject({ startMonth: '2026-11', endMonth: null });
  });

  it('answers "not found" for an unknown id and for another user\'s income, changing nothing', async () => {
    const saved = await service.create(A, salary());
    expect((await failure(service.update(A, 'inc-999', { amountMkd: 1 }))).getStatus()).toBe(404);
    const others = await failure(service.update(B, saved.id, { amountMkd: 1 }));
    expect(others.getStatus()).toBe(404);
    expect(codeOf(others)).toBe(ErrorCode.NotFound);
    expect((await service.list(A)).incomes[0]!.amountMkd).toBe(120_000);
  });
});

describe('delete', () => {
  it('removes exactly that income', async () => {
    const first = await service.create(A, salary({ name: 'One' }));
    const second = await service.create(A, bonus({ name: 'Two' }));
    const third = await service.create(A, bonus({ name: 'Three', receivedOn: '2025-01-01' }));
    await service.delete(A, second.id);
    expect((await service.list(A)).incomes.map((i) => i.id).sort()).toEqual(
      [first.id, third.id].sort(),
    );
  });

  it('answers "not found" the second time, and for an unknown id', async () => {
    const saved = await service.create(A, salary());
    await service.delete(A, saved.id);
    expect((await failure(service.delete(A, saved.id))).getStatus()).toBe(404);
    expect((await failure(service.delete(A, 'inc-999'))).getStatus()).toBe(404);
  });

  it("refuses to delete another user's income, which stays", async () => {
    const saved = await service.create(A, salary());
    expect((await failure(service.delete(B, saved.id))).getStatus()).toBe(404);
    expect((await service.list(A)).incomes).toHaveLength(1);
  });
});
