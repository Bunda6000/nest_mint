import type {
  BillsResponse,
  CategoriesResponse,
  ObligationResponse,
  ObligationsResponse,
} from '@nestmint/shared';
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

  describe('loans', () => {
    const loan = async (user: E2eUser, over: Record<string, unknown> = {}) => ({
      name: 'Mortgage',
      lender: 'Komercijalna Banka',
      loanType: 'housing',
      principalMkd: 1_000_000,
      annualRateBp: 600,
      categoryId: await category(user, 'Electricity'),
      dueDay: 5,
      startMonth: '2026-01',
      endMonth: '2035-12',
      ...over,
    });

    it('refuses the endpoint without a login', async () => {
      await e2e.http().post('/api/v1/obligations/loans').send({}).expect(401);
    });

    it('creates a loan with a calculated payment and lists it', async () => {
      const user = await e2e.newUser();
      const saved = (await e2e.post('/obligations/loans', user, await loan(user)).expect(201))
        .body as ObligationResponse;
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

      const list = (await e2e.get('/obligations', user).expect(200)).body as ObligationsResponse;
      expect(list.obligations).toHaveLength(1);
      expect(list.obligations[0]).toMatchObject({ kind: 'loan', expectedAmountMkd: 11_102 });
    });

    it("keeps the bank's payment when one is given", async () => {
      const user = await e2e.newUser();
      const saved = (
        await e2e
          .post('/obligations/loans', user, await loan(user, { monthlyPaymentMkd: 15_500 }))
          .expect(201)
      ).body as ObligationResponse;
      expect(saved.expectedAmountMkd).toBe(15_500);
    });

    it("makes the loan's payments appear as bills, one per month, until the last month", async () => {
      const user = await e2e.newUser();
      const saved = (
        await e2e
          .post(
            '/obligations/loans',
            user,
            await loan(user, {
              startMonth: '2026-01',
              endMonth: '2026-03',
              monthlyPaymentMkd: 9_000,
            }),
          )
          .expect(201)
      ).body as ObligationResponse;
      for (const month of ['2026-01', '2026-02', '2026-03', '2026-04']) {
        await e2e.post(`/bills/generate?month=${month}`, user, {}).expect(200);
      }
      const months: string[] = [];
      for (const month of ['2026-01', '2026-02', '2026-03', '2026-04']) {
        const { bills } = (await e2e.get(`/bills?month=${month}`, user).expect(200)).body as {
          bills: { obligationId: string; period: string; expectedAmountMkd: number }[];
        };
        for (const bill of bills.filter((b) => b.obligationId === saved.id)) {
          expect(bill.expectedAmountMkd).toBe(9_000);
          months.push(bill.period);
        }
      }
      expect(months).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('answers 400 with the field names for invalid input', async () => {
      const user = await e2e.newUser();
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ lender: ' ' }, 'lender'],
        [{ loanType: 'car' }, 'loanType'],
        [{ principalMkd: 0 }, 'principalMkd'],
        [{ annualRateBp: 10_001 }, 'annualRateBp'],
        [{ endMonth: '2025-12' }, 'endMonth'],
        [{ monthlyPaymentMkd: 0 }, 'monthlyPaymentMkd'],
      ];
      for (const [over, field] of cases) {
        const response = await e2e
          .post('/obligations/loans', user, await loan(user, over))
          .expect(400);
        expect(Object.keys(errorOf(response.body).details ?? {})).toContain(field);
      }
      expect(
        ((await e2e.get('/obligations', user)).body as ObligationsResponse).obligations,
      ).toEqual([]);
    });

    it("refuses another user's category (404) and an archived one (409)", async () => {
      const user = await e2e.newUser();
      const other = await e2e.newUser();
      await e2e
        .post(
          '/obligations/loans',
          user,
          await loan(user, { categoryId: await category(other, 'Electricity') }),
        )
        .expect(404);
      const water = await category(user, 'Water');
      await e2e.patch(`/categories/${water}`, user, { archived: true }).expect(200);
      await e2e
        .post('/obligations/loans', user, await loan(user, { categoryId: water }))
        .expect(409);
    });

    it('lets the database refuse a loan missing its fields, and a bill carrying loan fields', async () => {
      const user = await e2e.newUser();
      const base = {
        userId: user.id,
        categoryId: await category(user, 'Electricity'),
        name: 'Bad',
        expectedAmountMkd: 100,
        dueDay: 1,
        recurrence: 'monthly' as const,
        months: [],
        startMonth: new Date('2026-01-01T00:00:00Z'),
      };
      await expect(
        e2e.prisma.obligation.create({ data: { ...base, kind: 'loan' } }),
      ).rejects.toThrow();
      await expect(
        e2e.prisma.obligation.create({ data: { ...base, principalMkd: 1_000 } }),
      ).rejects.toThrow();
      await expect(
        e2e.prisma.obligation.create({
          data: {
            ...base,
            kind: 'loan',
            payee: 'Bank',
            loanType: 'consumer',
            principalMkd: 1_000,
            annualRateBp: 10_001,
            endMonth: new Date('2027-01-01T00:00:00Z'),
          },
        }),
      ).rejects.toThrow();
    });

    describe('rate changes', () => {
      const change = (over: Record<string, unknown> = {}) => ({
        effectiveMonth: '2026-03',
        annualRateBp: 700,
        monthlyPaymentMkd: 16_000,
        ...over,
      });
      const expectedIn = async (user: E2eUser, month: string) => {
        await e2e.post(`/bills/generate?month=${month}`, user, {}).expect(200);
        const list = (await e2e.get(`/bills?month=${month}`, user).expect(200))
          .body as BillsResponse;
        return list.bills.map((b) => b.expectedAmountMkd);
      };

      it('refuses the endpoint without a login', async () => {
        await e2e.http().post('/api/v1/obligations/x/rate-changes').send({}).expect(401);
      });

      it('stores the change, updates unpaid bills from that month and keeps earlier ones', async () => {
        const user = await e2e.newUser();
        const saved = (
          await e2e
            .post('/obligations/loans', user, await loan(user, { monthlyPaymentMkd: 15_500 }))
            .expect(201)
        ).body as ObligationResponse;
        expect(await expectedIn(user, '2026-02')).toEqual([15_500]);
        expect(await expectedIn(user, '2026-03')).toEqual([15_500]);

        const updated = (
          await e2e.post(`/obligations/${saved.id}/rate-changes`, user, change()).expect(201)
        ).body as ObligationResponse;
        expect(updated.expectedAmountMkd).toBe(15_500);
        expect(updated.loan!.rateChanges).toEqual([
          { effectiveMonth: '2026-03', annualRateBp: 700, monthlyPaymentMkd: 16_000 },
        ]);
        expect(await expectedIn(user, '2026-02')).toEqual([15_500]);
        expect(await expectedIn(user, '2026-03')).toEqual([16_000]);
        expect(await expectedIn(user, '2026-04')).toEqual([16_000]);
      });

      it('replaces a change made twice for the same month', async () => {
        const user = await e2e.newUser();
        const saved = (await e2e.post('/obligations/loans', user, await loan(user)).expect(201))
          .body as ObligationResponse;
        await e2e.post(`/obligations/${saved.id}/rate-changes`, user, change()).expect(201);
        const again = (
          await e2e
            .post(
              `/obligations/${saved.id}/rate-changes`,
              user,
              change({ monthlyPaymentMkd: 15_900 }),
            )
            .expect(201)
        ).body as ObligationResponse;
        expect(again.loan!.rateChanges).toHaveLength(1);
        expect(again.loan!.rateChanges[0]!.monthlyPaymentMkd).toBe(15_900);
      });

      it('answers 400, 404 and 409 for bad input, other users and plain bills', async () => {
        const user = await e2e.newUser();
        const other = await e2e.newUser();
        const saved = (await e2e.post('/obligations/loans', user, await loan(user)).expect(201))
          .body as ObligationResponse;
        const response = await e2e
          .post(
            `/obligations/${saved.id}/rate-changes`,
            user,
            change({ effectiveMonth: '2025-01' }),
          )
          .expect(400);
        expect(Object.keys(errorOf(response.body).details ?? {})).toContain('effectiveMonth');
        await e2e
          .post(`/obligations/${saved.id}/rate-changes`, user, change({ monthlyPaymentMkd: 0 }))
          .expect(400);
        await e2e.post(`/obligations/${saved.id}/rate-changes`, other, change()).expect(404);

        const bill = (
          await e2e
            .post('/obligations', user, {
              recurrence: 'monthly',
              name: 'Water',
              categoryId: await category(user, 'Water'),
              expectedAmountMkd: 1_000,
              dueDay: 3,
              startMonth: '2026-01',
            })
            .expect(201)
        ).body as ObligationResponse;
        await e2e.post(`/obligations/${bill.id}/rate-changes`, user, change()).expect(409);
      });

      it('lets the database refuse a bad month, rate or payment, and removes changes with the loan', async () => {
        const user = await e2e.newUser();
        const saved = (await e2e.post('/obligations/loans', user, await loan(user)).expect(201))
          .body as ObligationResponse;
        const row = {
          userId: user.id,
          obligationId: saved.id,
          effectiveMonth: new Date('2026-03-01T00:00:00Z'),
          annualRateBp: 700,
          monthlyPaymentMkd: 16_000,
        };
        for (const bad of [
          { effectiveMonth: new Date('2026-03-15T00:00:00Z') },
          { annualRateBp: 10_001 },
          { monthlyPaymentMkd: 0 },
        ]) {
          await expect(
            e2e.prisma.loanRateChange.create({ data: { ...row, ...bad } }),
          ).rejects.toThrow();
        }
        await e2e.prisma.loanRateChange.create({ data: row });
        await expect(e2e.prisma.loanRateChange.create({ data: row })).rejects.toThrow();
        await e2e.prisma.obligation.delete({ where: { id: saved.id } });
        expect(await e2e.prisma.loanRateChange.count({ where: { obligationId: saved.id } })).toBe(
          0,
        );
      });
    });
  });
});
