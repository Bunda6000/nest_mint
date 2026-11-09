import type { IncomeResponse, IncomesResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';
import { INCOME_REPOSITORY, type IncomeRepository } from './income.repository.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('income', () => {
  const e2e = new E2eHarness('@income-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  const errorOf = (body: unknown) =>
    (body as { error: { code: string; details?: Record<string, string> } }).error;

  const salary = (over: Record<string, unknown> = {}) => ({
    recurrence: 'monthly',
    name: 'Salary',
    amountMkd: 120_000,
    startMonth: '2026-01',
    payDay: 25,
    ...over,
  });
  const bonus = (over: Record<string, unknown> = {}) => ({
    recurrence: 'one_off',
    name: 'Bonus',
    amountMkd: 30_000,
    receivedOn: '2026-11-03',
    ...over,
  });

  const add = async (user: E2eUser, body: Record<string, unknown>) =>
    (await e2e.post('/income', user, body).expect(201)).body as IncomeResponse;
  const list = async (user: E2eUser): Promise<IncomeResponse[]> =>
    ((await e2e.get('/income', user).expect(200)).body as IncomesResponse).incomes;

  describe('login', () => {
    it('is required for every endpoint', async () => {
      const id = randomUUID();
      await e2e.http().get('/api/v1/income').expect(401);
      await e2e.http().post('/api/v1/income').send(salary()).expect(401);
      await e2e.http().patch(`/api/v1/income/${id}`).send({ amountMkd: 1 }).expect(401);
      await e2e.http().delete(`/api/v1/income/${id}`).expect(401);
    });
  });

  describe('adding income', () => {
    it('saves a monthly salary exactly', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary({ name: '  Salary  ' }));
      expect(saved).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Salary',
        amountMkd: 120_000,
        recurrence: 'monthly',
        receivedOn: null,
        startMonth: '2026-01',
        endMonth: null,
        payDay: 25,
      });
      expect(await list(user)).toEqual([saved]);
    });

    it('saves a salary with an end month, and the same month for start and end', async () => {
      const user = await e2e.newUser();
      expect((await add(user, salary({ endMonth: '2026-10' }))).endMonth).toBe('2026-10');
      const single = await add(user, salary({ startMonth: '2026-05', endMonth: '2026-05' }));
      expect([single.startMonth, single.endMonth]).toEqual(['2026-05', '2026-05']);
    });

    it('saves one-off income with its date exactly, whatever the time zone', async () => {
      const user = await e2e.newUser();
      for (const day of ['2026-01-01', '2025-12-31', '2024-02-29']) {
        expect((await add(user, bonus({ receivedOn: day }))).receivedOn).toBe(day);
      }
    });

    it('stores months correctly across a year boundary', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary({ startMonth: '2025-12', endMonth: '2026-01' }));
      expect([saved.startMonth, saved.endMonth]).toEqual(['2025-12', '2026-01']);
    });

    it('refuses invalid input with field messages, saving nothing', async () => {
      const user = await e2e.newUser();
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['no recurrence', { ...bonus(), recurrence: undefined }, 'recurrence'],
        ['unknown recurrence', bonus({ recurrence: 'weekly' }), 'recurrence'],
        ['empty name', salary({ name: '  ' }), 'name'],
        ['long name', salary({ name: 'x'.repeat(61) }), 'name'],
        ['zero amount', salary({ amountMkd: 0 }), 'amountMkd'],
        ['decimal amount', salary({ amountMkd: 1.5 }), 'amountMkd'],
        ['text amount', salary({ amountMkd: '5' }), 'amountMkd'],
        ['huge amount', salary({ amountMkd: 100_000_001 }), 'amountMkd'],
        ['pay day 0', salary({ payDay: 0 }), 'payDay'],
        ['pay day 32', salary({ payDay: 32 }), 'payDay'],
        ['no pay day', salary({ payDay: undefined }), 'payDay'],
        ['bad start month', salary({ startMonth: '2026-13' }), 'startMonth'],
        ['bad end month', salary({ endMonth: 'soon' }), 'endMonth'],
        ['end before start', salary({ endMonth: '2025-12' }), 'endMonth'],
        ['impossible date', bonus({ receivedOn: '2026-02-30' }), 'receivedOn'],
        ['no date', bonus({ receivedOn: undefined }), 'receivedOn'],
        ['pay day on one-off', bonus({ payDay: 5 }), 'form'],
        ['date on monthly', salary({ receivedOn: '2026-11-03' }), 'form'],
        ['owner field', salary({ userId: randomUUID() }), 'form'],
      ];
      for (const [label, body, field] of cases) {
        const response = await e2e.post('/income', user, body);
        expect(response.status, label).toBe(400);
        expect(errorOf(response.body).code, label).toBe('VALIDATION_FAILED');
        expect(Object.keys(errorOf(response.body).details ?? {}), label).toContain(field);
      }
      expect(await list(user)).toEqual([]);
    });
  });

  describe('the list', () => {
    it('is empty for a new user', async () => {
      expect(await list(await e2e.newUser())).toEqual([]);
    });

    it('puts the newest start first, mixing monthly and one-off income', async () => {
      const user = await e2e.newUser();
      await add(user, salary({ name: 'Old job', startMonth: '2024-03', endMonth: '2025-12' }));
      await add(user, bonus({ name: 'Refund', receivedOn: '2026-05-10' }));
      await add(user, salary({ name: 'New job', startMonth: '2026-01' }));
      await add(user, bonus({ name: 'Bonus', receivedOn: '2026-11-03' }));
      expect((await list(user)).map((i) => i.name)).toEqual([
        'Bonus',
        'Refund',
        'New job',
        'Old job',
      ]);
    });

    it("never shows one user's income to another", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await add(alice, salary({ amountMkd: 111 }));
      await add(bob, salary({ amountMkd: 222 }));
      expect((await list(alice)).map((i) => i.amountMkd)).toEqual([111]);
      expect((await list(bob)).map((i) => i.amountMkd)).toEqual([222]);
    });
  });

  describe('editing income', () => {
    it('changes only the fields that were sent', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary());
      const response = await e2e
        .patch(`/income/${saved.id}`, user, { amountMkd: 130_000 })
        .expect(200);
      expect(response.body).toEqual({ ...saved, amountMkd: 130_000 });
      expect(await list(user)).toEqual([{ ...saved, amountMkd: 130_000 }]);
    });

    it('can change several fields, end a salary, and take the end away', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary());
      const changed = await e2e
        .patch(`/income/${saved.id}`, user, {
          name: '  Pay  ',
          payDay: 1,
          startMonth: '2026-02',
          endMonth: '2026-12',
        })
        .expect(200);
      expect(changed.body).toMatchObject({
        name: 'Pay',
        payDay: 1,
        startMonth: '2026-02',
        endMonth: '2026-12',
      });
      const reopened = await e2e.patch(`/income/${saved.id}`, user, { endMonth: null }).expect(200);
      expect(reopened.body.endMonth).toBeNull();
    });

    it('changes the date of one-off income', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, bonus());
      const response = await e2e
        .patch(`/income/${saved.id}`, user, { receivedOn: '2026-11-05' })
        .expect(200);
      expect(response.body.receivedOn).toBe('2026-11-05');
    });

    it('records when it was changed', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary());
      await new Promise((resolve) => setTimeout(resolve, 25));
      await e2e.patch(`/income/${saved.id}`, user, { amountMkd: 1 }).expect(200);
      const row = await e2e.prisma.income.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
    });

    it('refuses invalid changes with field messages, changing nothing', async () => {
      const user = await e2e.newUser();
      const monthly = await add(user, salary({ startMonth: '2026-03', endMonth: '2026-08' }));
      const oneOff = await add(user, bonus());
      const cases: Array<[string, string, Record<string, unknown>, string]> = [
        ['nothing to change', monthly.id, {}, 'form'],
        ['zero amount', monthly.id, { amountMkd: 0 }, 'amountMkd'],
        ['empty name', monthly.id, { name: '' }, 'name'],
        ['pay day 40', monthly.id, { payDay: 40 }, 'payDay'],
        ['end before start', monthly.id, { endMonth: '2026-02' }, 'endMonth'],
        ['start after end', monthly.id, { startMonth: '2026-09' }, 'startMonth'],
        ['date on monthly', monthly.id, { receivedOn: '2026-11-03' }, 'receivedOn'],
        ['pay day on one-off', oneOff.id, { payDay: 5 }, 'payDay'],
        ['end month on one-off', oneOff.id, { endMonth: '2026-12' }, 'endMonth'],
        ['changing the recurrence', monthly.id, { recurrence: 'one_off' }, 'form'],
        ['changing the owner', monthly.id, { userId: randomUUID() }, 'form'],
      ];
      for (const [label, id, body, field] of cases) {
        const response = await e2e.patch(`/income/${id}`, user, body);
        expect(response.status, label).toBe(400);
        expect(Object.keys(errorOf(response.body).details ?? {}), label).toContain(field);
      }
      expect((await list(user)).sort((a, b) => a.name.localeCompare(b.name))).toEqual(
        [monthly, oneOff].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });

    it('answers "not found" for an unknown id and for an id that is not a UUID', async () => {
      const user = await e2e.newUser();
      await e2e.patch(`/income/${randomUUID()}`, user, { amountMkd: 1 }).expect(404);
      await e2e.patch('/income/not-a-uuid', user, { amountMkd: 1 }).expect(404);
    });

    it("cannot change another user's income", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = await add(alice, salary());
      const response = await e2e.patch(`/income/${saved.id}`, bob, { amountMkd: 1 });
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe('NOT_FOUND');
      expect(await list(alice)).toEqual([saved]);
    });
  });

  describe('deleting income', () => {
    it('removes exactly that one', async () => {
      const user = await e2e.newUser();
      const first = await add(user, salary({ name: 'One' }));
      const second = await add(user, bonus({ name: 'Two' }));
      const third = await add(user, bonus({ name: 'Three', receivedOn: '2025-01-01' }));
      const response = await e2e.delete(`/income/${second.id}`, user).expect(204);
      expect(response.text).toBe('');
      expect((await list(user)).map((i) => i.id).sort()).toEqual([first.id, third.id].sort());
    });

    it('answers "not found" the second time, for an unknown id and for a non-UUID', async () => {
      const user = await e2e.newUser();
      const saved = await add(user, salary());
      await e2e.delete(`/income/${saved.id}`, user).expect(204);
      await e2e.delete(`/income/${saved.id}`, user).expect(404);
      await e2e.delete(`/income/${randomUUID()}`, user).expect(404);
      await e2e.delete('/income/not-a-uuid', user).expect(404);
    });

    it("cannot delete another user's income, which stays", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = await add(alice, salary());
      await e2e.delete(`/income/${saved.id}`, bob).expect(404);
      expect(await list(alice)).toEqual([saved]);
    });

    it('is removed together with the user', async () => {
      const user = await e2e.newUser();
      await add(user, salary());
      await e2e.prisma.user.delete({ where: { id: user.id } });
      expect(await e2e.prisma.income.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  // The service looks the row up by owner first, which could hide a broken filter in the
  // repository. These tests call the repository directly, so each layer has to hold on its own.
  describe('the repository on its own', () => {
    const repository = () => e2e.app.get<IncomeRepository>(INCOME_REPOSITORY);

    it("never reads, changes or deletes another user's income", async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const saved = await add(alice, salary());
      const repo = repository();

      expect(await repo.find(bob.id, saved.id)).toBeNull();
      expect(await repo.update(bob.id, saved.id, { amountMkd: 1 })).toBeNull();
      expect(await repo.delete(bob.id, saved.id)).toBe(false);
      expect(await repo.list(bob.id)).toEqual([]);
      expect(await repo.find(alice.id, saved.id)).toEqual(saved);
    });

    it('does work for the owner', async () => {
      const alice = await e2e.newUser();
      const saved = await add(alice, salary());
      const repo = repository();
      expect(
        await repo.update(alice.id, saved.id, { amountMkd: 5, endMonth: '2026-06' }),
      ).toMatchObject({
        amountMkd: 5,
        endMonth: '2026-06',
      });
      expect(await repo.delete(alice.id, saved.id)).toBe(true);
      expect(await repo.find(alice.id, saved.id)).toBeNull();
    });
  });

  describe('database rules', () => {
    const insert = async (user: E2eUser, data: Record<string, unknown>) =>
      e2e.prisma.income.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          name: 'Salary',
          amountMkd: 5,
          recurrence: 'monthly',
          startMonth: new Date('2026-01-01T00:00:00Z'),
          payDay: 25,
          ...data,
        } as never,
      });

    it('accepts valid monthly and one-off rows', async () => {
      const user = await e2e.newUser();
      await expect(insert(user, {})).resolves.toBeDefined();
      await expect(
        insert(user, {
          recurrence: 'one_off',
          startMonth: null,
          payDay: null,
          receivedOn: new Date('2026-11-03T00:00:00Z'),
        }),
      ).resolves.toBeDefined();
    });

    it('refuses an amount outside 1 to 100,000,000, a bad name, and a bad pay day', async () => {
      const user = await e2e.newUser();
      for (const amountMkd of [0, -1, 100_000_001])
        await expect(insert(user, { amountMkd })).rejects.toThrow();
      await expect(insert(user, { amountMkd: 100_000_000 })).resolves.toBeDefined();
      await expect(insert(user, { name: '   ' })).rejects.toThrow();
      await expect(insert(user, { name: 'x'.repeat(61) })).rejects.toThrow();
      for (const payDay of [0, 32]) await expect(insert(user, { payDay })).rejects.toThrow();
    });

    it('refuses fields that do not fit the recurrence', async () => {
      const user = await e2e.newUser();
      const date = new Date('2026-11-03T00:00:00Z');
      await expect(insert(user, { payDay: null })).rejects.toThrow(); // monthly without a pay day
      await expect(insert(user, { startMonth: null })).rejects.toThrow(); // monthly without a start
      await expect(insert(user, { receivedOn: date })).rejects.toThrow(); // monthly with a date
      await expect(
        insert(user, { recurrence: 'one_off', startMonth: null, payDay: null }),
      ).rejects.toThrow(); // one-off without a date
      await expect(insert(user, { recurrence: 'one_off', receivedOn: date })).rejects.toThrow(); // one-off with monthly fields
    });

    it('refuses an end before the start, and a month that is not the first of its month', async () => {
      const user = await e2e.newUser();
      await expect(insert(user, { endMonth: new Date('2025-12-01T00:00:00Z') })).rejects.toThrow();
      await expect(
        insert(user, { startMonth: new Date('2026-01-15T00:00:00Z') }),
      ).rejects.toThrow();
      await expect(insert(user, { endMonth: new Date('2026-06-10T00:00:00Z') })).rejects.toThrow();
    });
  });
});
