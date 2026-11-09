import type {
  BillsResponse,
  CategoriesResponse,
  GenerateBillsResponse,
  ObligationResponse,
} from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';

const monthOf = (offset: number): string => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
};
const THIS = monthOf(0);
const NEXT = monthOf(1);

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('bills', () => {
  const e2e = new E2eHarness('@bills-test.example');

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

  const addObligation = async (user: E2eUser, over: Record<string, unknown> = {}) =>
    (
      await e2e
        .post('/obligations', user, {
          recurrence: 'monthly',
          name: 'Electricity',
          payee: 'EVN',
          categoryId: await category(user, 'Electricity'),
          expectedAmountMkd: 4_500,
          dueDay: 15,
          startMonth: '2026-01',
          ...over,
        })
        .expect(201)
    ).body as ObligationResponse;

  const generate = async (user: E2eUser, month: string) =>
    (await e2e.post(`/bills/generate?month=${month}`, user, {}).expect(200))
      .body as GenerateBillsResponse;
  const list = async (user: E2eUser, month: string) =>
    (await e2e.get(`/bills?month=${month}`, user).expect(200)).body as BillsResponse;

  it('refuses every endpoint without a login', async () => {
    await e2e.http().get(`/api/v1/bills?month=${THIS}`).expect(401);
    await e2e.http().post(`/api/v1/bills/generate?month=${THIS}`).send({}).expect(401);
  });

  it("creates the month's bills from the obligations and lists them", async () => {
    const user = await e2e.newUser();
    const o = await addObligation(user, { dueDay: 31 });
    await addObligation(user, {
      name: 'Garden',
      recurrence: 'custom_months',
      months: [(Number(THIS.slice(5)) % 12) + 1],
    });

    expect(await generate(user, THIS)).toEqual({ month: THIS, created: 1 });
    const { bills } = await list(user, THIS);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      obligationId: o.id,
      obligationName: 'Electricity',
      payee: 'EVN',
      categoryName: 'Electricity',
      period: THIS,
      expectedAmountMkd: 4_500,
    });
    // Due day 31 becomes the last day of a short month.
    expect(bills[0]!.dueDate.startsWith(THIS)).toBe(true);
    const lastDay = new Date(
      Date.UTC(Number(THIS.slice(0, 4)), Number(THIS.slice(5)), 0),
    ).getUTCDate();
    expect(bills[0]!.dueDate).toBe(`${THIS}-${String(lastDay).padStart(2, '0')}`);
  });

  it('never creates the same bill twice, also when asked many times at once', async () => {
    const user = await e2e.newUser();
    await addObligation(user);
    const results = await Promise.all(Array.from({ length: 6 }, () => generate(user, THIS)));
    expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(1);
    expect((await list(user, THIS)).bills).toHaveLength(1);
    expect((await generate(user, THIS)).created).toBe(0);
    expect(await e2e.prisma.bill.count({ where: { userId: user.id } })).toBe(1);
  });

  it('the database itself refuses a second bill for the same obligation and month', async () => {
    const user = await e2e.newUser();
    const o = await addObligation(user);
    const data = {
      userId: user.id,
      obligationId: o.id,
      periodMonth: new Date(`${THIS}-01T00:00:00Z`),
      dueDate: new Date(`${THIS}-15T00:00:00Z`),
      expectedAmountMkd: 100,
    };
    await e2e.prisma.bill.create({ data });
    await expect(e2e.prisma.bill.create({ data })).rejects.toThrow();
  });

  it('a bill keeps its amount when the obligation changes; the next month uses the new one', async () => {
    const user = await e2e.newUser();
    const o = await addObligation(user);
    await generate(user, THIS);
    await e2e.patch(`/obligations/${o.id}`, user, { expectedAmountMkd: 6_000 }).expect(200);
    expect((await generate(user, THIS)).created).toBe(0);
    expect((await list(user, THIS)).bills[0]!.expectedAmountMkd).toBe(4_500);
    expect((await generate(user, NEXT)).created).toBe(1);
    expect((await list(user, NEXT)).bills[0]!.expectedAmountMkd).toBe(6_000);
  });

  it('only reads when listing, and refuses months too far ahead', async () => {
    const user = await e2e.newUser();
    await addObligation(user);
    expect((await list(user, THIS)).bills).toEqual([]);
    const response = await e2e.post(`/bills/generate?month=${monthOf(2)}`, user, {}).expect(400);
    expect(errorOf(response.body).details).toHaveProperty('month');
    expect(await e2e.prisma.bill.count({ where: { userId: user.id } })).toBe(0);
  });

  it('answers 400 for a missing or invalid month', async () => {
    const user = await e2e.newUser();
    for (const path of ['/bills', '/bills?month=2026-13', '/bills?month=nov', '/bills/generate']) {
      const response =
        path === '/bills/generate'
          ? await e2e.post(path, user, {}).expect(400)
          : await e2e.get(path, user).expect(400);
      expect(errorOf(response.body).details).toHaveProperty('month');
    }
  });

  it('keeps two users apart', async () => {
    const a = await e2e.newUser();
    const b = await e2e.newUser();
    await addObligation(a, { name: 'Mine' });
    await addObligation(b, { name: 'Theirs' });
    expect((await generate(a, THIS)).created).toBe(1);
    expect((await list(a, THIS)).bills.map((x) => x.obligationName)).toEqual(['Mine']);
    expect((await list(b, THIS)).bills).toEqual([]);
    await generate(b, THIS);
    expect((await list(b, THIS)).bills.map((x) => x.obligationName)).toEqual(['Theirs']);
    expect((await list(a, THIS)).bills).toHaveLength(1);
  });

  it('deleting a user removes their obligations and bills', async () => {
    const user = await e2e.newUser();
    await addObligation(user);
    await generate(user, THIS);
    await e2e.prisma.user.delete({ where: { id: user.id } });
    expect(await e2e.prisma.obligation.count({ where: { userId: user.id } })).toBe(0);
    expect(await e2e.prisma.bill.count({ where: { userId: user.id } })).toBe(0);
  });
});
