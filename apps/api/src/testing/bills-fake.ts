import {
  type BillChange,
  BillPaymentError,
  type BillRecord,
  type BillsRepository,
  type NewBill,
  type Payment,
  paymentNote,
} from '../bills/bills.repository.js';
import type { GroupMonthTotal } from '@nestmint/shared';
import type { InMemoryObligations } from './obligations-fake.js';
import type { InMemoryTransactions } from './transactions-fake.js';

type Row = NewBill & {
  id: string;
  userId: string;
  actualAmountMkd: number | null;
  invoiceRef: string | null;
  transactionId: string | null;
};

const BY_DUE_DATE = (a: BillRecord, b: BillRecord) =>
  a.dueDate.localeCompare(b.dueDate) ||
  a.obligationName.localeCompare(b.obligationName) ||
  a.id.localeCompare(b.id);

/**
 * Keeps each user's bills apart and refuses a second bill for the same obligation and month, like
 * the database's unique key does. Names come from the obligations the bills belong to. Paying
 * creates a real expense in the fake transactions and locks it (the foreign key), so the paid day
 * and amount are always the expense's own.
 */
export class InMemoryBills implements BillsRepository {
  readonly rows: Row[] = [];
  private counter = 0;

  constructor(
    private readonly obligations: InMemoryObligations,
    private readonly transactions: InMemoryTransactions,
    /** Stands in for the category-to-group join the database does. */
    private readonly groupOf: (
      userId: string,
      categoryId: string,
    ) => { id: string; name: string } = () => ({ id: 'group-1', name: 'Group' }),
  ) {}

  async createMissing(userId: string, bills: NewBill[]): Promise<number> {
    let created = 0;
    for (const bill of bills) {
      const owned = this.obligations.rows.some(
        (o) => o.id === bill.obligationId && o.userId === userId,
      );
      if (!owned) throw new Error('Foreign key: the obligation belongs to someone else');
      const exists = this.rows.some(
        (r) => r.obligationId === bill.obligationId && r.period === bill.period,
      );
      if (exists) continue;
      this.rows.push({
        ...bill,
        id: `bill-${++this.counter}`,
        userId,
        actualAmountMkd: null,
        invoiceRef: null,
        transactionId: null,
      });
      created += 1;
    }
    return created;
  }

  async listMonth(userId: string, month: string): Promise<BillRecord[]> {
    return this.records(userId, (r) => r.period === month);
  }

  async sumExpectedByGroupAndMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<GroupMonthTotal[]> {
    const totals = new Map<string, GroupMonthTotal>();
    for (const r of this.rows.filter((x) => x.userId === userId)) {
      if (r.period < fromMonth || r.period > toMonth) continue;
      const obligation = this.obligations.rows.find((o) => o.id === r.obligationId)!;
      const group = this.groupOf(userId, obligation.categoryId);
      const key = `${group.id}|${r.period}`;
      const known = totals.get(key);
      totals.set(key, {
        month: r.period,
        groupId: group.id,
        groupName: group.name,
        amountMkd: (known?.amountMkd ?? 0) + r.expectedAmountMkd,
      });
    }
    return [...totals.values()];
  }

  async listUnpaid(userId: string): Promise<BillRecord[]> {
    return this.records(userId, (r) => r.transactionId === null);
  }

  async listPaid(userId: string, limit: number): Promise<BillRecord[]> {
    return this.records(userId, (r) => r.transactionId !== null)
      .sort(
        (a, b) =>
          b.paid!.paidOn.localeCompare(a.paid!.paidOn) ||
          b.dueDate.localeCompare(a.dueDate) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
  }

  async countPaid(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.transactionId !== null).length;
  }

  async find(userId: string, id: string): Promise<BillRecord | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    return row ? this.record(row) : null;
  }

  async deleteUnpaidFromMonth(
    userId: string,
    obligationId: string,
    fromMonth: string,
  ): Promise<number> {
    const keep = this.rows.filter(
      (r) =>
        !(
          r.userId === userId &&
          r.obligationId === obligationId &&
          r.transactionId === null &&
          r.period >= fromMonth
        ),
    );
    const removed = this.rows.length - keep.length;
    this.rows.splice(0, this.rows.length, ...keep);
    return removed;
  }

  async countPaidForObligation(userId: string, obligationId: string): Promise<number> {
    return this.rows.filter(
      (r) => r.userId === userId && r.obligationId === obligationId && r.transactionId !== null,
    ).length;
  }

  async deleteUnpaidForObligation(userId: string, obligationId: string): Promise<number> {
    const keep = this.rows.filter(
      (r) => !(r.userId === userId && r.obligationId === obligationId && r.transactionId === null),
    );
    const removed = this.rows.length - keep.length;
    this.rows.splice(0, this.rows.length, ...keep);
    return removed;
  }

  async setUnpaidExpectedAmounts(
    userId: string,
    obligationId: string,
    fromMonth: string,
    amountForPeriod: (period: string) => number,
  ): Promise<number> {
    let changed = 0;
    for (const row of this.rows) {
      if (row.userId !== userId || row.obligationId !== obligationId) continue;
      if (row.transactionId !== null || row.period < fromMonth) continue;
      row.expectedAmountMkd = amountForPeriod(row.period);
      changed += 1;
    }
    return changed;
  }

  async update(userId: string, id: string, change: BillChange): Promise<BillRecord | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row || row.transactionId !== null) return null;
    if (change.actualAmountMkd !== undefined) row.actualAmountMkd = change.actualAmountMkd;
    if (change.invoiceRef !== undefined) row.invoiceRef = change.invoiceRef;
    return this.record(row);
  }

  async pay(userId: string, payments: Payment[]): Promise<BillRecord[]> {
    // All or none: work out every refusal before anything is created.
    const seen = new Set<string>();
    for (const p of payments) {
      const row = this.rows.find((r) => r.id === p.billId && r.userId === userId);
      if (!row) throw new BillPaymentError('not_found', p.billId);
      if (row.transactionId !== null || seen.has(p.billId)) {
        throw new BillPaymentError('already_paid', p.billId);
      }
      seen.add(p.billId);
    }
    // Claim every bill before anything is awaited, like the database's row lock: a second payment
    // arriving now finds them taken.
    for (const p of payments) {
      this.rows.find((r) => r.id === p.billId && r.userId === userId)!.transactionId = 'claimed';
    }
    const paid: BillRecord[] = [];
    for (const p of payments) {
      const row = this.rows.find((r) => r.id === p.billId && r.userId === userId)!;
      const o = this.obligations.rows.find((x) => x.id === row.obligationId)!;
      const expense = await this.transactions.create(userId, {
        kind: 'expense',
        categoryId: o.categoryId,
        amountMkd: p.amountMkd,
        occurredOn: p.paidOn,
        note: paymentNote(o.name, row.invoiceRef),
      });
      row.transactionId = expense.id;
      this.transactions.locked.add(expense.id);
      paid.push(this.record(row));
    }
    return paid;
  }

  async undoPayment(userId: string, billId: string): Promise<BillRecord> {
    const row = this.rows.find((r) => r.id === billId && r.userId === userId);
    if (!row) throw new BillPaymentError('not_found', billId);
    if (row.transactionId === null) throw new BillPaymentError('not_paid', billId);
    const transactionId = row.transactionId;
    row.transactionId = null;
    this.transactions.locked.delete(transactionId);
    await this.transactions.delete(userId, transactionId);
    return this.record(row);
  }

  private records(userId: string, keep: (row: Row) => boolean): BillRecord[] {
    return this.rows
      .filter((r) => r.userId === userId && keep(r))
      .map((r) => this.record(r))
      .sort(BY_DUE_DATE);
  }

  private record(row: Row): BillRecord {
    const o = this.obligations.rows.find((x) => x.id === row.obligationId)!;
    const expense = row.transactionId
      ? this.transactions.rows.find((t) => t.id === row.transactionId)!
      : null;
    return {
      id: row.id,
      obligationId: row.obligationId,
      obligationName: o.name,
      payee: o.payee,
      categoryId: o.categoryId,
      categoryName: o.categoryName,
      period: row.period,
      dueDate: row.dueDate,
      expectedAmountMkd: row.expectedAmountMkd,
      actualAmountMkd: row.actualAmountMkd,
      invoiceRef: row.invoiceRef,
      paid: expense
        ? { transactionId: expense.id, paidOn: expense.occurredOn, amountMkd: expense.amountMkd }
        : null,
    };
  }
}
