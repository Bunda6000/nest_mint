import type {
  BillResponse,
  BillsInboxResponse,
  BillsResponse,
  CategoriesResponse,
  GenerateBillsResponse,
  ObligationResponse,
  SyncBillsResponse,
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
const TODAY = new Date().toISOString().slice(0, 10);
const monthStart = (offset: number) => new Date(`${monthOf(offset)}-01T00:00:00.000Z`);

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

  const category_ = (user: E2eUser) => category(user, 'Electricity');
  const sync = async (user: E2eUser) =>
    (await e2e.post('/bills/sync', user, {}).expect(200)).body as SyncBillsResponse;
  const inbox = async (user: E2eUser, tab = 'due', asOf?: string) =>
    (await e2e.get(`/bills/inbox?tab=${tab}${asOf ? `&asOf=${asOf}` : ''}`, user).expect(200))
      .body as BillsInboxResponse;
  /** The bill of an obligation for a month, creating it first when needed. */
  async function billFor(user: E2eUser, obligationId: string, month = THIS): Promise<BillResponse> {
    await generate(user, month);
    return (await list(user, month)).bills.find((b) => b.obligationId === obligationId)!;
  }
  const pay = (user: E2eUser, id: string, body?: unknown) =>
    e2e.post(`/bills/${id}/pay`, user, body);
  const expensesOf = (user: E2eUser) =>
    e2e.prisma.transaction.findMany({ where: { userId: user.id } });

  it('refuses every endpoint without a login', async () => {
    await e2e.http().get(`/api/v1/bills?month=${THIS}`).expect(401);
    await e2e.http().post(`/api/v1/bills/generate?month=${THIS}`).send({}).expect(401);
    const id = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f';
    await e2e.http().get('/api/v1/bills/inbox').expect(401);
    await e2e.http().post('/api/v1/bills/sync').send({}).expect(401);
    await e2e
      .http()
      .post('/api/v1/bills/pay')
      .send({ billIds: [id] })
      .expect(401);
    await e2e.http().post(`/api/v1/bills/${id}/pay`).send({}).expect(401);
    await e2e.http().post(`/api/v1/bills/${id}/undo-payment`).send({}).expect(401);
    await e2e.http().patch(`/api/v1/bills/${id}`).send({ invoiceRef: 'x' }).expect(401);
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

  describe('sync: catching up', () => {
    it('creates this month and next month for a bill entered now', async () => {
      const user = await e2e.newUser();
      await addObligation(user);
      expect(await sync(user)).toEqual({ created: 2 });
      expect((await list(user, THIS)).bills).toHaveLength(1);
      expect((await list(user, NEXT)).bills).toHaveLength(1);
      expect(await sync(user)).toEqual({ created: 0 });
    });

    it('creates the months missed since the bill was entered, and they are overdue', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user, { startMonth: '2024-01' });
      await e2e.prisma.obligation.update({
        where: { id: o.id },
        data: { createdAt: monthStart(-3) },
      });
      expect(await sync(user)).toEqual({ created: 5 }); // -3, -2, -1, this, next
      const overdue = await inbox(user, 'overdue');
      expect(overdue.counts.overdue).toBeGreaterThanOrEqual(3);
      expect(overdue.bills[0]!.period).toBe(monthOf(-3));
      expect(overdue.bills.every((b) => b.status === 'overdue')).toBe(true);
    });

    it('never creates the same bill twice, also when asked many times at once', async () => {
      const user = await e2e.newUser();
      await addObligation(user);
      const results = await Promise.all(Array.from({ length: 6 }, () => sync(user)));
      expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(2);
      expect(await e2e.prisma.bill.count({ where: { userId: user.id } })).toBe(2);
    });

    it('only creates bills from the own obligations', async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      await addObligation(a);
      expect(await sync(b)).toEqual({ created: 0 });
      expect(await e2e.prisma.bill.count({ where: { userId: b.id } })).toBe(0);
    });
  });

  describe('inbox', () => {
    it('splits unpaid bills into Due and Overdue and counts the tabs', async () => {
      const user = await e2e.newUser();
      const late = await addObligation(user, { name: 'Late', dueDay: 1 });
      const soon = await addObligation(user, { name: 'Soon', dueDay: 28 });
      await sync(user);
      const asOf = `${THIS}-15`;
      const bills = [late, soon].map((o) => o.id);
      expect(bills).toHaveLength(2);
      const overdue = await inbox(user, 'overdue', asOf <= TODAY ? asOf : TODAY);
      expect(overdue.bills.every((b) => b.status === 'overdue')).toBe(true);
      const due = await inbox(user, 'due', TODAY);
      expect(due.bills.every((b) => b.status === 'due')).toBe(true);
      expect(due.counts.due + due.counts.overdue).toBe(4); // two obligations, two months
      expect(due.counts.paid).toBe(0);
    });

    it('measures Overdue on the day asked for', async () => {
      const user = await e2e.newUser();
      await addObligation(user, { name: 'Rent', dueDay: 10 });
      await sync(user);
      const before = await inbox(user, 'due', `${THIS}-09`);
      const after = await inbox(user, 'due', `${THIS}-11`).catch(() => null);
      expect(before.counts.overdue).toBe(0);
      if (TODAY >= `${THIS}-11`) expect(after!.counts.overdue).toBe(1);
      const onDay = await inbox(user, 'due', `${THIS}-10`);
      expect(onDay.counts.overdue).toBe(0); // due that day is not late yet
    });

    it('defaults to the Due tab and answers 400 for a bad tab or day', async () => {
      const user = await e2e.newUser();
      expect((await e2e.get('/bills/inbox', user).expect(200)).body.tab).toBe('due');
      for (const path of [
        '/bills/inbox?tab=late',
        '/bills/inbox?tab=',
        '/bills/inbox?asOf=2026-02-30',
        '/bills/inbox?asOf=today',
      ]) {
        const response = await e2e.get(path, user).expect(400);
        expect(Object.keys(errorOf(response.body).details!).length).toBeGreaterThan(0);
      }
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const response = await e2e.get(`/bills/inbox?asOf=${future}`, user).expect(400);
      expect(errorOf(response.body).details).toHaveProperty('asOf');
    });

    it('keeps two users apart', async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const o = await addObligation(a);
      await sync(a);
      const bill = await billFor(a, o.id);
      await pay(a, bill.id, {}).expect(200);
      expect((await inbox(b, 'due')).counts).toEqual({ due: 0, overdue: 0, paid: 0 });
      expect((await inbox(b, 'paid')).bills).toEqual([]);
      expect((await inbox(a, 'paid')).counts.paid).toBe(1);
    });
  });

  describe('pay', () => {
    it('creates an expense in the bill category for today and the bill amount, with no body at all', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const paid = (await pay(user, bill.id).expect(200)).body as BillResponse;
      expect(paid).toMatchObject({
        id: bill.id,
        status: 'paid',
        amountMkd: 4_500,
        expectedAmountMkd: 4_500,
        transactionId: expect.any(String),
      });
      const expenses = await expensesOf(user);
      expect(expenses).toHaveLength(1);
      expect(expenses[0]).toMatchObject({
        id: paid.transactionId,
        kind: 'expense',
        categoryId: bill.categoryId,
        amountMkd: 4_500,
        note: 'Electricity',
      });
      expect(expenses[0]!.occurredOn.toISOString().slice(0, 10)).toBe(paid.paidOn);
      expect(paid.paidOn).toBe(TODAY);
    });

    it('takes the day and amount that were entered', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const paid = (
        await pay(user, bill.id, { paidOn: `${THIS}-02`, amountMkd: 4_380 }).expect(200)
      ).body as BillResponse;
      expect(paid).toMatchObject({
        paidOn: `${THIS}-02`,
        amountMkd: 4_380,
        expectedAmountMkd: 4_500,
      });
    });

    it('pays the actual amount and puts the invoice reference in the expense note (NM-23)', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await e2e
        .patch(`/bills/${bill.id}`, user, { actualAmountMkd: 4_820, invoiceRef: 'INV-118' })
        .expect(200);
      const paid = (await pay(user, bill.id, {}).expect(200)).body as BillResponse;
      expect(paid).toMatchObject({
        amountMkd: 4_820,
        actualAmountMkd: 4_820,
        invoiceRef: 'INV-118',
      });
      expect((await expensesOf(user))[0]).toMatchObject({
        amountMkd: 4_820,
        note: 'Electricity · INV-118',
      });
    });

    it('answers 409 for a bill that is already paid, and creates no second expense', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await pay(user, bill.id, {}).expect(200);
      const response = await pay(user, bill.id, {}).expect(409);
      expect(errorOf(response.body).code).toBe('CONFLICT');
      expect(await expensesOf(user)).toHaveLength(1);
    });

    it('many payments at once: exactly one succeeds and exactly one expense exists', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => pay(user, bill.id, {}).then((r) => r.status)),
      );
      expect(results.filter((status) => status === 200)).toHaveLength(1);
      expect(results.filter((status) => status === 409)).toHaveLength(5);
      expect(await expensesOf(user)).toHaveLength(1);
      expect((await e2e.prisma.bill.findUnique({ where: { id: bill.id } }))!.transactionId).toBe(
        (await expensesOf(user))[0]!.id,
      );
    });

    it('answers 400 for a bad day, a bad amount, a day too far ahead and unknown fields', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const bad: Array<[unknown, string]> = [
        [{ paidOn: '2026-02-30' }, 'paidOn'],
        [{ paidOn: future }, 'paidOn'],
        [{ amountMkd: 0 }, 'amountMkd'],
        [{ amountMkd: 10.5 }, 'amountMkd'],
        [{ amountMkd: 100_000_001 }, 'amountMkd'],
      ];
      for (const [body, field] of bad) {
        expect(errorOf((await pay(user, bill.id, body).expect(400)).body).details).toHaveProperty(
          field,
        );
      }
      await pay(user, bill.id, { status: 'paid' }).expect(400);
      expect(await expensesOf(user)).toHaveLength(0);
    });

    it("answers 404 for another user's bill, a missing bill and a bad id", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const o = await addObligation(a);
      const bill = await billFor(a, o.id);
      await pay(b, bill.id, {}).expect(404);
      await pay(a, '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f', {}).expect(404);
      await pay(a, 'not-an-id', {}).expect(404);
      expect(await expensesOf(a)).toHaveLength(0);
      expect(await expensesOf(b)).toHaveLength(0);
    });

    it('correcting the expense afterwards corrects what the bill shows', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const paid = (await pay(user, bill.id, {}).expect(200)).body as BillResponse;
      await e2e
        .patch(`/transactions/${paid.transactionId}`, user, {
          amountMkd: 4_444,
          occurredOn: `${THIS}-03`,
        })
        .expect(200);
      const shown = (await list(user, THIS)).bills.find((x) => x.id === bill.id)!;
      expect(shown).toMatchObject({ amountMkd: 4_444, paidOn: `${THIS}-03`, status: 'paid' });
    });
  });

  describe('pay several bills', () => {
    async function threeBills(user: E2eUser) {
      const ids: string[] = [];
      for (const name of ['One', 'Two', 'Three']) {
        const o = await addObligation(user, { name, expectedAmountMkd: 1_000 });
        ids.push((await billFor(user, o.id)).id);
      }
      return ids;
    }

    it('pays all of them on one day, each for its own amount', async () => {
      const user = await e2e.newUser();
      const ids = await threeBills(user);
      const response = await e2e
        .post('/bills/pay', user, { billIds: ids, paidOn: `${THIS}-01` })
        .expect(200);
      const { bills } = response.body as BillsResponse;
      expect(bills.map((b) => b.id)).toEqual(ids);
      expect(bills.every((b) => b.status === 'paid' && b.paidOn === `${THIS}-01`)).toBe(true);
      expect(await expensesOf(user)).toHaveLength(3);
      expect((await inbox(user, 'paid')).counts.paid).toBe(3);
    });

    it('pays all or none: a bill that is already paid stops everything', async () => {
      const user = await e2e.newUser();
      const ids = await threeBills(user);
      await pay(user, ids[1]!, {}).expect(200);
      await e2e.post('/bills/pay', user, { billIds: ids }).expect(409);
      expect(await expensesOf(user)).toHaveLength(1);
      const unpaid = await e2e.prisma.bill.count({
        where: { userId: user.id, transactionId: null, id: { in: ids } },
      });
      expect(unpaid).toBe(2);
    });

    it("pays all or none: another user's bill stops everything", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const ids = await threeBills(a);
      const theirs = await addObligation(b);
      const theirBill = await billFor(b, theirs.id);
      await e2e.post('/bills/pay', a, { billIds: [ids[0]!, theirBill.id] }).expect(404);
      expect(await expensesOf(a)).toHaveLength(0);
      expect(await expensesOf(b)).toHaveLength(0);
    });

    it('answers 400 for no bills, the same bill twice, too many, bad ids, an amount and a future day', async () => {
      const user = await e2e.newUser();
      const ids = await threeBills(user);
      const id = (n: number) => `3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e${String(n).padStart(2, '0')}`;
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const cases: Array<[unknown, string]> = [
        [{ billIds: [] }, 'billIds'],
        [{}, 'billIds'],
        [{ billIds: [ids[0], ids[0]] }, 'billIds'],
        [{ billIds: Array.from({ length: 51 }, (_, n) => id(n)) }, 'billIds'],
        [{ billIds: ['nope'] }, 'billIds.0'],
        [{ billIds: ids, paidOn: future }, 'paidOn'],
      ];
      for (const [body, field] of cases) {
        expect(
          errorOf((await e2e.post('/bills/pay', user, body).expect(400)).body).details,
        ).toHaveProperty(field);
      }
      await e2e.post('/bills/pay', user, { billIds: ids, amountMkd: 5 }).expect(400);
      expect(await expensesOf(user)).toHaveLength(0);
    });
  });

  describe('undo payment', () => {
    it('opens the bill again and deletes the expense', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await e2e
        .patch(`/bills/${bill.id}`, user, { actualAmountMkd: 4_820, invoiceRef: 'INV-1' })
        .expect(200);
      await pay(user, bill.id, {}).expect(200);
      const reopened = (await e2e.post(`/bills/${bill.id}/undo-payment`, user, {}).expect(200))
        .body as BillResponse;
      expect(reopened).toMatchObject({
        status: expect.stringMatching(/due|overdue/),
        paidOn: null,
        transactionId: null,
        amountMkd: 4_820,
        invoiceRef: 'INV-1',
      });
      expect(await expensesOf(user)).toHaveLength(0);
      await pay(user, bill.id, {}).expect(200);
      expect(await expensesOf(user)).toHaveLength(1);
    });

    it("answers 409 for a bill that is not paid and 404 for a stranger's or missing bill", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const o = await addObligation(a);
      const bill = await billFor(a, o.id);
      await e2e.post(`/bills/${bill.id}/undo-payment`, a, {}).expect(409);
      await pay(a, bill.id, {}).expect(200);
      await e2e.post(`/bills/${bill.id}/undo-payment`, b, {}).expect(404);
      await e2e.post('/bills/3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f/undo-payment', a, {}).expect(404);
      expect(await expensesOf(a)).toHaveLength(1);
    });
  });

  describe('the expense of a paid bill', () => {
    it('cannot be deleted until the payment is undone', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const paid = (await pay(user, bill.id, {}).expect(200)).body as BillResponse;
      const response = await e2e.delete(`/transactions/${paid.transactionId}`, user).expect(409);
      expect(errorOf(response.body).code).toBe('CONFLICT');
      expect(await expensesOf(user)).toHaveLength(1);
      expect((await list(user, THIS)).bills.find((x) => x.id === bill.id)!.status).toBe('paid');
      await e2e.post(`/bills/${bill.id}/undo-payment`, user, {}).expect(200);
      expect(await expensesOf(user)).toHaveLength(0);
    });

    it('an ordinary expense can still be deleted', async () => {
      const user = await e2e.newUser();
      const category = await category_(user);
      const created = await e2e
        .post('/transactions', user, {
          kind: 'expense',
          categoryId: category,
          amountMkd: 100,
          occurredOn: TODAY,
        })
        .expect(201);
      await e2e.delete(`/transactions/${created.body.id}`, user).expect(204);
    });

    it("the database refuses to delete it, to link a bill to another user's expense, and to pay two bills with one expense", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const oa = await addObligation(a, { name: 'One' });
      const ob = await addObligation(a, { name: 'Two' });
      const first = await billFor(a, oa.id);
      const second = await billFor(a, ob.id);
      const paid = (await pay(a, first.id, {}).expect(200)).body as BillResponse;
      await expect(
        e2e.prisma.transaction.delete({ where: { id: paid.transactionId! } }),
      ).rejects.toMatchObject({ code: 'P2003' });

      const theirs = await e2e.prisma.transaction.create({
        data: {
          userId: b.id,
          kind: 'expense',
          categoryId: await category_(b),
          amountMkd: 10,
          occurredOn: new Date(`${TODAY}T00:00:00Z`),
        },
      });
      await expect(
        e2e.prisma.bill.update({ where: { id: second.id }, data: { transactionId: theirs.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await expect(
        e2e.prisma.bill.update({
          where: { id: second.id },
          data: { transactionId: paid.transactionId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('deleting a user removes a paid bill and its expense together', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await pay(user, bill.id, {}).expect(200);
      await e2e.prisma.user.delete({ where: { id: user.id } });
      expect(await e2e.prisma.bill.count({ where: { userId: user.id } })).toBe(0);
      expect(await e2e.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('enter the actual amount and invoice reference', () => {
    it('stores them and shows the actual amount instead of the expected one', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const updated = (
        await e2e
          .patch(`/bills/${bill.id}`, user, {
            actualAmountMkd: 4_820,
            invoiceRef: '  INV-2026/118  ',
          })
          .expect(200)
      ).body as BillResponse;
      expect(updated).toMatchObject({
        actualAmountMkd: 4_820,
        expectedAmountMkd: 4_500,
        amountMkd: 4_820,
        invoiceRef: 'INV-2026/118',
        status: expect.stringMatching(/due|overdue/),
      });
      const shown = (await list(user, THIS)).bills.find((x) => x.id === bill.id)!;
      expect(shown).toMatchObject({ amountMkd: 4_820, invoiceRef: 'INV-2026/118' });
    });

    it('null and empty text take them away again, and one field can change alone', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await e2e
        .patch(`/bills/${bill.id}`, user, { actualAmountMkd: 5_000, invoiceRef: 'A-1' })
        .expect(200);
      const kept = (
        await e2e.patch(`/bills/${bill.id}`, user, { actualAmountMkd: null }).expect(200)
      ).body as BillResponse;
      expect(kept).toMatchObject({ actualAmountMkd: null, amountMkd: 4_500, invoiceRef: 'A-1' });
      const cleared = (
        await e2e.patch(`/bills/${bill.id}`, user, { invoiceRef: '   ' }).expect(200)
      ).body as BillResponse;
      expect(cleared.invoiceRef).toBeNull();
    });

    it('refuses a paid bill with 409 and leaves it as it was', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      await pay(user, bill.id, {}).expect(200);
      await e2e.patch(`/bills/${bill.id}`, user, { actualAmountMkd: 1 }).expect(409);
      expect(
        (await e2e.prisma.bill.findUnique({ where: { id: bill.id } }))!.actualAmountMkd,
      ).toBeNull();
    });

    it("answers 400 for bad input and 404 for a stranger's bill", async () => {
      const a = await e2e.newUser();
      const b = await e2e.newUser();
      const o = await addObligation(a);
      const bill = await billFor(a, o.id);
      const bad: Array<[unknown, string?]> = [
        [{}],
        [{ actualAmountMkd: 0 }, 'actualAmountMkd'],
        [{ actualAmountMkd: 10.5 }, 'actualAmountMkd'],
        [{ actualAmountMkd: 100_000_001 }, 'actualAmountMkd'],
        [{ invoiceRef: 'x'.repeat(61) }, 'invoiceRef'],
        [{ expectedAmountMkd: 10 }],
      ];
      for (const [body, field] of bad) {
        const response = await e2e.patch(`/bills/${bill.id}`, a, body).expect(400);
        if (field) expect(errorOf(response.body).details).toHaveProperty(field);
      }
      await e2e.patch(`/bills/${bill.id}`, b, { invoiceRef: 'x' }).expect(404);
      expect((await e2e.prisma.bill.findUnique({ where: { id: bill.id } }))!.invoiceRef).toBeNull();
    });

    it('the database refuses an amount of 0 or too large, and an empty or too long reference', async () => {
      const user = await e2e.newUser();
      const o = await addObligation(user);
      const bill = await billFor(user, o.id);
      const set = (data: Record<string, unknown>) =>
        e2e.prisma.bill.update({ where: { id: bill.id }, data });
      await expect(set({ actualAmountMkd: 0 })).rejects.toThrow();
      await expect(set({ actualAmountMkd: 100_000_001 })).rejects.toThrow();
      await expect(set({ invoiceRef: '' })).rejects.toThrow();
      await expect(set({ invoiceRef: '   ' })).rejects.toThrow();
      await expect(set({ invoiceRef: 'x'.repeat(61) })).rejects.toThrow();
      await set({ actualAmountMkd: 1, invoiceRef: 'x'.repeat(60) });
    });
  });
});
