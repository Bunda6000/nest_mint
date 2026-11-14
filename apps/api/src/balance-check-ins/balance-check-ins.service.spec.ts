import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/fakes.js';
import { InMemoryBalanceCheckIns } from '../testing/balance-check-ins-fake.js';
import { InMemoryIncome } from '../testing/income-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { BalanceCheckInsService } from './balance-check-ins.service.js';

const A = 'user-a';
const B = 'user-b';

let income: InMemoryIncome;
let transactions: InMemoryTransactions;
let service: BalanceCheckInsService;

beforeEach(async () => {
  income = new InMemoryIncome();
  transactions = new InMemoryTransactions(() => 'Groceries');
  service = new BalanceCheckInsService(
    new InMemoryBalanceCheckIns(),
    income,
    transactions,
    new FakeClock(), // 2026-11-08
  );
  await income.create(A, {
    name: 'Salary',
    amountMkd: 100_000,
    recurrence: 'monthly',
    receivedOn: null,
    startMonth: '2026-01',
    endMonth: null,
    payDay: 5,
  });
});

const spend = (userId: string, amountMkd: number, occurredOn: string) =>
  transactions.create(userId, {
    kind: 'expense',
    categoryId: 'c',
    amountMkd,
    occurredOn,
    note: null,
  });

const statusCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
  return 200;
};

describe('balance check-in', () => {
  it('asks for the opening balance until the first check-in exists', async () => {
    expect(await service.status(A, '2026-10')).toEqual({
      month: '2026-10',
      checkIn: null,
      needsOpening: true,
    });
  });

  it('compares the typed balance with opening + income − expenses', async () => {
    await spend(A, 60_000, '2026-10-12');
    const result = await service.save(A, '2026-10', {
      openingBalanceMkd: 20_000,
      closingBalanceMkd: 50_000,
    });
    expect(result).toMatchObject({
      fromMonth: '2026-10',
      openingMkd: 20_000,
      incomeMkd: 100_000,
      expensesMkd: 60_000,
      expectedMkd: 60_000,
      untrackedMkd: 10_000,
      alert: false, // exactly 10 % of the income is not above the limit
    });
    expect((await service.status(A, '2026-10')).needsOpening).toBe(false);
  });

  it('alerts when more than 10 % of the income is unaccounted for', async () => {
    const result = await service.save(A, '2026-10', {
      openingBalanceMkd: 0,
      closingBalanceMkd: 89_000,
    });
    expect(result).toMatchObject({ untrackedMkd: 11_000, alert: true });
  });

  it('starts the next check-in from the previous closing balance', async () => {
    await service.save(A, '2026-09', { openingBalanceMkd: 0, closingBalanceMkd: 100_000 });
    await spend(A, 40_000, '2026-10-03');
    const result = await service.save(A, '2026-10', { closingBalanceMkd: 160_000 });
    expect(result).toMatchObject({
      fromMonth: '2026-10',
      openingMkd: 100_000,
      expectedMkd: 160_000,
      untrackedMkd: 0,
      alert: false,
    });
  });

  it('covers skipped months', async () => {
    await service.save(A, '2026-08', { openingBalanceMkd: 0, closingBalanceMkd: 100_000 });
    const result = await service.save(A, '2026-10', { closingBalanceMkd: 300_000 });
    expect(result).toMatchObject({
      fromMonth: '2026-09',
      incomeMkd: 200_000,
      expectedMkd: 300_000,
    });
  });

  it('replaces a check-in saved twice for the same month and keeps its opening balance', async () => {
    await service.save(A, '2026-10', { openingBalanceMkd: 5_000, closingBalanceMkd: 1_000 });
    const result = await service.save(A, '2026-10', { closingBalanceMkd: 105_000 });
    expect(result).toMatchObject({ openingMkd: 5_000, closingMkd: 105_000, untrackedMkd: 0 });
  });

  it('refuses a first check-in without an opening balance', async () => {
    expect(await statusCode(service.save(A, '2026-10', { closingBalanceMkd: 1 }))).toBe(400);
  });

  it('refuses an opening balance when an earlier check-in exists', async () => {
    await service.save(A, '2026-09', { openingBalanceMkd: 0, closingBalanceMkd: 1 });
    expect(
      await statusCode(service.save(A, '2026-10', { openingBalanceMkd: 5, closingBalanceMkd: 1 })),
    ).toBe(400);
  });

  it('refuses a month that has not started', async () => {
    expect(
      await statusCode(service.save(A, '2026-12', { openingBalanceMkd: 0, closingBalanceMkd: 1 })),
    ).toBe(400);
  });

  it("never mixes in another user's data", async () => {
    await spend(B, 99_000, '2026-10-01');
    await service.save(B, '2026-10', { openingBalanceMkd: 1, closingBalanceMkd: 1 });
    expect((await service.status(A, '2026-10')).checkIn).toBeNull();
    const result = await service.save(A, '2026-10', {
      openingBalanceMkd: 0,
      closingBalanceMkd: 100_000,
    });
    expect(result.expensesMkd).toBe(0);
  });
});
