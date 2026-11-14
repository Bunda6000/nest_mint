import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/fakes.js';
import { InMemoryGoals } from '../testing/goals-fake.js';
import { GoalsService } from './goals.service.js';

const A = 'user-a';
const B = 'user-b';

function setup() {
  const repository = new InMemoryGoals();
  const clock = new FakeClock(); // 2026-11-08
  return { repository, clock, service: new GoalsService(repository, clock) };
}

async function failure(call: Promise<unknown>): Promise<{ status: number }> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) return { status: error.getStatus() };
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const car = {
  kind: 'target_date',
  name: 'Car',
  priority: 2,
  targetMkd: 120_000,
  targetMonth: '2027-10',
} as const;

describe('GoalsService', () => {
  it('creates a goal with a starting amount and works out its progress', async () => {
    const { service } = setup();
    const goal = await service.create(A, { ...car, startingMkd: 24_000 });
    expect(goal).toMatchObject({
      savedMkd: 24_000,
      remainingMkd: 96_000,
      requiredMonthlyMkd: 8_000,
      monthsLeft: 12,
      status: 'no_pace', // nothing in the last three complete months yet
    });
  });

  it('forecasts from the pace of earlier months', async () => {
    const { service, repository } = setup();
    const goal = await service.create(A, { ...car });
    for (const occurredOn of ['2026-08-10', '2026-09-10', '2026-10-10']) {
      await repository.addContribution(A, goal.id, { amountMkd: 9_000, occurredOn, note: null });
    }
    const after = await service.get(A, goal.id);
    expect(after).toMatchObject({ savedMkd: 27_000, paceMkd: 9_000, status: 'on_track' });
    expect(after.completionMonth).toBe('2027-09'); // 93,000 / 9,000 → 11 months, Nov 2026 to Sep 2027
  });

  it('rejects a deadline in the past, but accepts this month', async () => {
    const { service } = setup();
    expect(await failure(service.create(A, { ...car, targetMonth: '2026-10' }))).toEqual({
      status: 400,
    });
    await service.create(A, { ...car, targetMonth: '2026-11' });
  });

  it('keeps a monthly goal ongoing and takes its pace from the plan', async () => {
    const { service } = setup();
    const goal = await service.create(A, {
      kind: 'monthly',
      name: 'Rainy day',
      priority: 1,
      monthlyMkd: 5_000,
    });
    expect(goal).toMatchObject({ status: 'ongoing', paceMkd: 5_000, progress: null });
  });

  it('adds and withdraws money but never below zero, or into the future', async () => {
    const { service } = setup();
    const goal = await service.create(A, car);
    const added = await service.addContribution(A, goal.id, {
      amountMkd: 10_000,
      occurredOn: '2026-11-01',
    });
    expect(added.savedMkd).toBe(10_000);
    expect(
      await failure(
        service.addContribution(A, goal.id, { amountMkd: -10_001, occurredOn: '2026-11-02' }),
      ),
    ).toEqual({ status: 400 });
    expect(
      await failure(
        service.addContribution(A, goal.id, { amountMkd: 1, occurredOn: '2026-11-09' }),
      ),
    ).toEqual({ status: 400 });
    const withdrawn = await service.addContribution(A, goal.id, {
      amountMkd: -4_000,
      occurredOn: '2026-11-03',
    });
    expect(withdrawn.savedMkd).toBe(6_000);
  });

  it('refuses to remove a deposit that a later withdrawal depends on', async () => {
    const { service } = setup();
    const goal = await service.create(A, car);
    await service.addContribution(A, goal.id, { amountMkd: 10_000, occurredOn: '2026-11-01' });
    await service.addContribution(A, goal.id, { amountMkd: -8_000, occurredOn: '2026-11-02' });
    const [withdrawal, deposit] = (await service.contributions(A, goal.id)).contributions;
    expect(await failure(service.removeContribution(A, goal.id, deposit!.id))).toEqual({
      status: 409,
    });
    const after = await service.removeContribution(A, goal.id, withdrawal!.id);
    expect(after.savedMkd).toBe(10_000);
  });

  it('refuses money in an archived goal, and updates by kind', async () => {
    const { service } = setup();
    const goal = await service.create(A, car);
    expect(
      (await service.update(A, goal.id, { targetMkd: 200_000, targetMonth: '2028-01' })).targetMkd,
    ).toBe(200_000);
    const monthly = await service.create(A, {
      kind: 'monthly',
      name: 'M',
      priority: 2,
      monthlyMkd: 100,
    });
    expect(await failure(service.update(A, monthly.id, { targetMkd: 5 }))).toEqual({ status: 400 });
    expect(await failure(service.update(A, monthly.id, { targetMonth: '2028-01' }))).toEqual({
      status: 400,
    });
    expect(await failure(service.update(A, monthly.id, { monthlyMkd: null }))).toEqual({
      status: 400,
    });
    await service.update(A, goal.id, { archived: true });
    expect(
      await failure(
        service.addContribution(A, goal.id, { amountMkd: 1, occurredOn: '2026-11-01' }),
      ),
    ).toEqual({ status: 409 });
    expect((await service.list(A)).goals.map((g) => g.id)).not.toContain(goal.id);
    expect((await service.list(A, true)).goals.map((g) => g.id)).toContain(goal.id);
  });

  it('orders by priority and keeps users apart', async () => {
    const { service } = setup();
    await service.create(A, { ...car, name: 'Low', priority: 3 });
    const high = await service.create(A, { ...car, name: 'High', priority: 1 });
    expect((await service.list(A)).goals.map((g) => g.name)).toEqual(['High', 'Low']);
    expect((await service.list(B)).goals).toEqual([]);
    expect(await failure(service.get(B, high.id))).toEqual({ status: 404 });
    expect(
      await failure(
        service.addContribution(B, high.id, { amountMkd: 1, occurredOn: '2026-11-01' }),
      ),
    ).toEqual({ status: 404 });
    expect(await failure(service.remove(B, high.id))).toEqual({ status: 404 });
    await service.remove(A, high.id);
    expect(await failure(service.get(A, high.id))).toEqual({ status: 404 });
  });
});
