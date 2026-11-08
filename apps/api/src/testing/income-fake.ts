import type { IncomeResponse } from '@nestmint/shared';
import type { IncomeChange, IncomeRepository, NewIncome } from '../income/income.repository.js';

type Row = IncomeResponse & { userId: string };

/** Keeps each user's income apart and lists newest entered first, like the real repository. */
export class InMemoryIncome implements IncomeRepository {
  readonly rows: Row[] = [];
  private counter = 0;

  async create(userId: string, input: NewIncome): Promise<IncomeResponse> {
    const row: Row = { id: `inc-${++this.counter}`, userId, ...input };
    this.rows.push(row);
    return InMemoryIncome.response(row);
  }

  async list(userId: string): Promise<IncomeResponse[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .reverse()
      .map((r) => InMemoryIncome.response(r));
  }

  async find(userId: string, id: string): Promise<IncomeResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    return row ? InMemoryIncome.response(row) : null;
  }

  async update(userId: string, id: string, change: IncomeChange): Promise<IncomeResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return null;
    if (change.name !== undefined) row.name = change.name;
    if (change.amountMkd !== undefined) row.amountMkd = change.amountMkd;
    if (change.receivedOn !== undefined) row.receivedOn = change.receivedOn;
    if (change.startMonth !== undefined) row.startMonth = change.startMonth;
    if (change.endMonth !== undefined) row.endMonth = change.endMonth;
    if (change.payDay !== undefined) row.payDay = change.payDay;
    return InMemoryIncome.response(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }

  private static response(row: Row): IncomeResponse {
    const { id, name, amountMkd, recurrence, receivedOn, startMonth, endMonth, payDay } = row;
    return { id, name, amountMkd, recurrence, receivedOn, startMonth, endMonth, payDay };
  }
}
