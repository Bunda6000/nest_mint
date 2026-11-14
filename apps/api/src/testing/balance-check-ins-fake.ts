import type {
  BalanceCheckInsRepository,
  StoredCheckIn,
} from '../balance-check-ins/balance-check-ins.repository.js';

/** Keeps each user's check-ins apart, like the real repository. */
export class InMemoryBalanceCheckIns implements BalanceCheckInsRepository {
  readonly rows: (StoredCheckIn & { userId: string })[] = [];

  async find(userId: string, month: string): Promise<StoredCheckIn | null> {
    return this.strip(this.rows.find((r) => r.userId === userId && r.month === month));
  }

  async findBefore(userId: string, month: string): Promise<StoredCheckIn | null> {
    const earlier = this.rows
      .filter((r) => r.userId === userId && r.month < month)
      .sort((a, b) => b.month.localeCompare(a.month));
    return this.strip(earlier[0]);
  }

  async save(userId: string, checkIn: StoredCheckIn): Promise<void> {
    const index = this.rows.findIndex((r) => r.userId === userId && r.month === checkIn.month);
    if (index >= 0) this.rows.splice(index, 1);
    this.rows.push({ userId, ...checkIn });
  }

  private strip(row: (StoredCheckIn & { userId: string }) | undefined): StoredCheckIn | null {
    return row
      ? { month: row.month, closingMkd: row.closingMkd, openingMkd: row.openingMkd }
      : null;
  }
}
