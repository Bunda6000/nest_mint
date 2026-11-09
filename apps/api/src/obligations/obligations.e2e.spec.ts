import type { CategoriesResponse, ObligationResponse, ObligationsResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';
import { OBLIGATIONS_REPOSITORY, type ObligationsRepository } from './obligations.repository.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('obligations', () => {
  const e2e = new E2eHarness('@obligations-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  async function category(user: E2eUser, name: string): Promise<string> {
    const { groups } = (await e2e.get('/categories?includeArchived=true', user).expect(200))
      .body as CategoriesResponse;
    for (const group of groups) {
      const found = group.categories.find((c) => c.name === name);
      if (found) return found.id;
    }
    throw new Error(`No category ${name}`);
  }

  const bill = async (user: E2eUser, over: Record<string, unknown> = {}) => ({
    recurrence: 'monthly',
    name: 'Electricity',
    payee: 'EVN',
    categoryId: await category(user, 'Electricity'),
    expectedAmountMkd: 4_500,
    dueDay: 15,
    startMonth: '2026-01',
    ...over,
  });

  it('refuses every endpoint without a login', async () => {
    await e2e.http().get('/api/v1/obligations').expect(401);
    await e2e.http().post('/api/v1/obligations').send({}).expect(401);
    await e2e
      .http()
      .patch('/api/v1/obligations/3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f')
      .send({})
      .expect(401);
  });

  it('creates each kind of obligation and lists them by name', async () => {
    const user = await e2e.newUser();
    const monthly = (await e2e.post('/obligations', user, await bill(user)).expect(201))
      .body as ObligationResponse;
    expect(monthly).toMatchObject({
      name: 'Electricity',
      payee: 'EVN',
      categoryName: 'Electricity',
      expectedAmountMkd: 4_500,
      dueDay: 15,
      recurrence: 'monthly',
      everyNMonths: null,
      months: null,
      startMonth: '2026-01',
      endMonth: null,
    });

    const every = (
      await e2e
        .post(
          '/obligations',
          user,
          await bill(user, {
            name: 'Insurance',
            recurrence: 'every_n_months',
            everyNMonths: 3,
            payee: '',
          }),
        )
        .expect(201)
    ).body as ObligationResponse;
    expect(every).toMatchObject({ everyNMonths: 3, months: null, payee: null });

    const heating = (
      await e2e
        .post(
          '/obligations',
          user,
          await bill(user, {
            name: 'Heating',
            recurrence: 'custom_months',
            months: [12, 1, 11, 1],
            endMonth: '2028-03',
          }),
        )
        .expect(201)
    ).body as ObligationResponse;
    expect(heating).toMatchObject({ months: [1, 11, 12], everyNMonths: null, endMonth: '2028-03' });

    const list = (await e2e.get('/obligations', user).expect(200)).body as ObligationsResponse;
    expect(list.obligations.map((o) => o.name)).toEqual(['Electricity', 'Heating', 'Insurance']);
  });

  it('answers 400 with the field names for invalid input', async () => {
    const user = await e2e.newUser();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: ' ' }, 'name'],
      [{ expectedAmountMkd: 0 }, 'expectedAmountMkd'],
      [{ dueDay: 32 }, 'dueDay'],
      [{ startMonth: '2026-13' }, 'startMonth'],
      [{ endMonth: '2025-12' }, 'endMonth'],
      [{ categoryId: 'food' }, 'categoryId'],
      [{ recurrence: 'every_n_months', everyNMonths: 1 }, 'everyNMonths'],
      [{ recurrence: 'custom_months', months: [] }, 'months'],
    ];
    for (const [over, field] of cases) {
      const response = await e2e.post('/obligations', user, await bill(user, over)).expect(400);
      expect(
        Object.keys(errorOf(response.body).details ?? {}).some((k) => k.startsWith(field)),
      ).toBe(true);
    }
    expect(((await e2e.get('/obligations', user)).body as ObligationsResponse).obligations).toEqual(
      [],
    );
  });

  it('refuses a category that is archived (409) or belongs to someone else (404)', async () => {
    const user = await e2e.newUser();
    const other = await e2e.newUser();
    await e2e
      .post(
        '/obligations',
        user,
        await bill(user, { categoryId: await category(other, 'Electricity') }),
      )
      .expect(404);

    const water = await category(user, 'Water');
    await e2e.patch(`/categories/${water}`, user, { archived: true }).expect(200);
    const response = await e2e
      .post('/obligations', user, await bill(user, { categoryId: water }))
      .expect(409);
    expect(errorOf(response.body).code).toBe('CONFLICT');
  });

  it('edits an obligation and enforces the rules of its recurrence', async () => {
    const user = await e2e.newUser();
    const saved = (await e2e.post('/obligations', user, await bill(user)).expect(201))
      .body as ObligationResponse;

    const updated = (
      await e2e
        .patch(`/obligations/${saved.id}`, user, {
          expectedAmountMkd: 5_200,
          payee: '',
          endMonth: '2026-12',
        })
        .expect(200)
    ).body as ObligationResponse;
    expect(updated).toMatchObject({
      expectedAmountMkd: 5_200,
      payee: null,
      endMonth: '2026-12',
      name: 'Electricity',
    });

    const cleared = (
      await e2e.patch(`/obligations/${saved.id}`, user, { endMonth: null }).expect(200)
    ).body as ObligationResponse;
    expect(cleared.endMonth).toBeNull();

    await e2e.patch(`/obligations/${saved.id}`, user, { months: [1] }).expect(400);
    await e2e.patch(`/obligations/${saved.id}`, user, { everyNMonths: 3 }).expect(400);
    await e2e.patch(`/obligations/${saved.id}`, user, { recurrence: 'custom_months' }).expect(400);
    await e2e.patch(`/obligations/${saved.id}`, user, {}).expect(400);
    await e2e.patch(`/obligations/${saved.id}`, user, { startMonth: '2027-01' }).expect(200);
    const bad = await e2e
      .patch(`/obligations/${saved.id}`, user, { endMonth: '2026-06' })
      .expect(400);
    expect(errorOf(bad.body).details).toHaveProperty('endMonth');
    await e2e.patch('/obligations/not-a-uuid', user, { name: 'X' }).expect(404);
  });

  it('keeps two users apart', async () => {
    const a = await e2e.newUser();
    const b = await e2e.newUser();
    const mine = (await e2e.post('/obligations', a, await bill(a, { name: 'Mine' })).expect(201))
      .body as ObligationResponse;

    expect(((await e2e.get('/obligations', b)).body as ObligationsResponse).obligations).toEqual(
      [],
    );
    await e2e.patch(`/obligations/${mine.id}`, b, { name: 'Hijacked' }).expect(404);
    const after = (await e2e.get('/obligations', a)).body as ObligationsResponse;
    expect(after.obligations.map((o) => o.name)).toEqual(['Mine']);
  });

  it("the repository on its own never touches another user's row", async () => {
    const a = await e2e.newUser();
    const b = await e2e.newUser();
    const repository = e2e.app.get<ObligationsRepository>(OBLIGATIONS_REPOSITORY);
    const mine = (await e2e.post('/obligations', a, await bill(a, { name: 'Mine' })).expect(201))
      .body as ObligationResponse;

    expect(await repository.update(b.id, mine.id, { name: 'Hijacked' })).toBeNull();
    expect(await repository.find(b.id, mine.id)).toBeNull();
    expect(await repository.list(b.id)).toEqual([]);
    expect((await repository.find(a.id, mine.id))?.name).toBe('Mine');
  });

  it("the database itself refuses an obligation with another user's category", async () => {
    const a = await e2e.newUser();
    const b = await e2e.newUser();
    const foreign = await category(b, 'Electricity');
    await expect(
      e2e.prisma.obligation.create({
        data: {
          userId: a.id,
          categoryId: foreign,
          name: 'Sneaky',
          expectedAmountMkd: 100,
          dueDay: 1,
          recurrence: 'monthly',
          months: [],
          startMonth: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });
});
