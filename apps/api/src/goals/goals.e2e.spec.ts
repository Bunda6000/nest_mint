import type { ContributionsResponse, GoalResponse, GoalsResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('savings goals', () => {
  const e2e = new E2eHarness('@goals-test.example');
  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const nextYear = `${new Date().getUTCFullYear() + 1}-12`;
  const today = () => new Date().toISOString().slice(0, 10);

  it('needs a login', async () => {
    const id = randomUUID();
    for (const response of await Promise.all([
      e2e.http().get('/api/v1/goals'),
      e2e.http().post('/api/v1/goals').send({}),
      e2e.http().patch(`/api/v1/goals/${id}`).send({ name: 'x' }),
      e2e.http().post(`/api/v1/goals/${id}/contributions`).send({}),
    ])) {
      expect(response.status).toBe(401);
    }
  });

  it('creates, saves into, forecasts and deletes a goal', async () => {
    const user = await e2e.newUser();
    const created = await e2e
      .post('/goals', user, {
        kind: 'target_date',
        name: 'Car',
        targetMkd: 120_000,
        targetMonth: nextYear,
        startingMkd: 20_000,
      })
      .expect(201);
    const goal = created.body as GoalResponse;
    expect(goal).toMatchObject({ name: 'Car', savedMkd: 20_000, remainingMkd: 100_000 });
    expect(goal.requiredMonthlyMkd).toBeGreaterThan(0);

    const added = await e2e
      .post(`/goals/${goal.id}/contributions`, user, { amountMkd: 5_000, occurredOn: today() })
      .expect(201);
    expect((added.body as GoalResponse).savedMkd).toBe(25_000);

    const list = (await e2e.get('/goals', user).expect(200)).body as GoalsResponse;
    expect(list.goals).toHaveLength(1);
    const history = (await e2e.get(`/goals/${goal.id}/contributions`, user).expect(200))
      .body as ContributionsResponse;
    expect(history.contributions.map((c) => c.amountMkd)).toEqual([5_000, 20_000]);

    await e2e.patch(`/goals/${goal.id}`, user, { priority: 1, name: 'New car' }).expect(200);
    await e2e.delete(`/goals/${goal.id}`, user).expect(204);
    await e2e.get(`/goals/${goal.id}`, user).expect(404);
  });

  it('validates input', async () => {
    const user = await e2e.newUser();
    await e2e.post('/goals', user, { kind: 'target_date', name: 'x', targetMkd: 5 }).expect(400);
    await e2e
      .post('/goals', user, {
        kind: 'target_date',
        name: 'x',
        targetMkd: 5,
        targetMonth: '2020-01',
      })
      .expect(400);
    await e2e.post('/goals', user, { kind: 'monthly', name: 'x' }).expect(400);
    await e2e.get('/goals/not-a-uuid', user).expect(404);
  });

  it('keeps goals private to their owner', async () => {
    const alice = await e2e.newUser();
    const bob = await e2e.newUser();
    const goal = (
      await e2e
        .post('/goals', alice, { kind: 'monthly', name: 'Rainy', monthlyMkd: 1_000 })
        .expect(201)
    ).body as GoalResponse;

    expect(((await e2e.get('/goals', bob).expect(200)).body as GoalsResponse).goals).toEqual([]);
    await e2e.get(`/goals/${goal.id}`, bob).expect(404);
    await e2e.patch(`/goals/${goal.id}`, bob, { name: 'Mine' }).expect(404);
    await e2e.delete(`/goals/${goal.id}`, bob).expect(404);
    await e2e
      .post(`/goals/${goal.id}/contributions`, bob, { amountMkd: 5, occurredOn: today() })
      .expect(404);
    await e2e.get(`/goals/${goal.id}/contributions`, bob).expect(404);
    expect(
      ((await e2e.get(`/goals/${goal.id}`, alice).expect(200)).body as GoalResponse).name,
    ).toBe('Rainy');
  });
});
