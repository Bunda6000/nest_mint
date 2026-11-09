import type { BillResponse } from '@nestmint/shared';
import type { BillsRepository, NewBill } from '../bills/bills.repository.js';
import type { InMemoryObligations } from './obligations-fake.js';

type Row = NewBill & { id: string; userId: string };

/**
 * Keeps each user's bills apart and refuses a second bill for the same obligation and month, like
 * the database's unique key does. Names come from the obligations the bills belong to.
 */
export class InMemoryBills implements BillsRepository {
  readonly rows: Row[] = [];
  private counter = 0;

  constructor(private readonly obligations: InMemoryObligations) {}

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
      this.rows.push({ ...bill, id: `bill-${++this.counter}`, userId });
      created += 1;
    }
    return created;
  }

  async listMonth(userId: string, month: string): Promise<BillResponse[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.period === month)
      .map((r) => {
        const o = this.obligations.rows.find((x) => x.id === r.obligationId)!;
        return {
          id: r.id,
          obligationId: r.obligationId,
          obligationName: o.name,
          payee: o.payee,
          categoryId: o.categoryId,
          categoryName: o.categoryName,
          period: r.period,
          dueDate: r.dueDate,
          expectedAmountMkd: r.expectedAmountMkd,
        };
      })
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) ||
          a.obligationName.localeCompare(b.obligationName) ||
          a.id.localeCompare(b.id),
      );
  }
}
