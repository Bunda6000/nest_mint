import type { ObligationResponse, RateChangeResponse } from '@nestmint/shared';
import type {
  NewObligation,
  ObligationChange,
  ObligationsRepository,
} from '../obligations/obligations.repository.js';

type Row = ObligationResponse & { userId: string };

/** Keeps each user's obligations apart and lists newest entered first, like the real repository. */
export class InMemoryObligations implements ObligationsRepository {
  readonly rows: Row[] = [];
  private counter = 0;

  /** `createdMonth` says which month "now" is, so a test can enter a bill in a chosen month. */
  constructor(
    private readonly categoryName: (userId: string, categoryId: string) => string,
    private readonly createdMonth: () => string = () => '2026-11',
  ) {}

  async create(userId: string, input: NewObligation): Promise<ObligationResponse> {
    const row: Row = {
      id: `obl-${++this.counter}`,
      userId,
      name: input.name,
      payee: input.payee,
      categoryId: input.categoryId,
      categoryName: this.categoryName(userId, input.categoryId),
      expectedAmountMkd: input.expectedAmountMkd,
      dueDay: input.dueDay,
      recurrence: input.recurrence,
      everyNMonths: input.everyNMonths,
      months: input.recurrence === 'custom_months' ? [...input.months] : null,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      createdMonth: this.createdMonth(),
      kind: input.loan ? 'loan' : 'bill',
      loan: input.loan ? { ...input.loan, rateChanges: [] } : null,
    };
    this.rows.push(row);
    return InMemoryObligations.response(row);
  }

  async list(userId: string): Promise<ObligationResponse[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .reverse()
      .map((r) => InMemoryObligations.response(r));
  }

  async find(userId: string, id: string): Promise<ObligationResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    return row ? InMemoryObligations.response(row) : null;
  }

  async update(
    userId: string,
    id: string,
    change: ObligationChange,
  ): Promise<ObligationResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return null;
    if (change.name !== undefined) row.name = change.name;
    if (change.payee !== undefined) row.payee = change.payee;
    if (change.categoryId !== undefined) {
      row.categoryId = change.categoryId;
      row.categoryName = this.categoryName(userId, change.categoryId);
    }
    if (change.expectedAmountMkd !== undefined) row.expectedAmountMkd = change.expectedAmountMkd;
    if (change.dueDay !== undefined) row.dueDay = change.dueDay;
    if (change.startMonth !== undefined) row.startMonth = change.startMonth;
    if (change.endMonth !== undefined) row.endMonth = change.endMonth;
    if (change.everyNMonths !== undefined) row.everyNMonths = change.everyNMonths;
    if (change.months !== undefined) row.months = [...change.months];
    if (row.loan && change.loanType !== undefined) row.loan.loanType = change.loanType;
    if (row.loan && change.principalMkd !== undefined) row.loan.principalMkd = change.principalMkd;
    return InMemoryObligations.response(row);
  }

  async upsertRateChange(
    userId: string,
    id: string,
    change: RateChangeResponse,
  ): Promise<ObligationResponse | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row || !row.loan) return null;
    const others = row.loan.rateChanges.filter((c) => c.effectiveMonth !== change.effectiveMonth);
    row.loan.rateChanges = [...others, { ...change }].sort((a, b) =>
      a.effectiveMonth.localeCompare(b.effectiveMonth),
    );
    return InMemoryObligations.response(row);
  }

  private static response(row: Row): ObligationResponse {
    return {
      id: row.id,
      name: row.name,
      payee: row.payee,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      expectedAmountMkd: row.expectedAmountMkd,
      dueDay: row.dueDay,
      recurrence: row.recurrence,
      everyNMonths: row.everyNMonths,
      months: row.months ? [...row.months] : null,
      startMonth: row.startMonth,
      endMonth: row.endMonth,
      createdMonth: row.createdMonth,
      kind: row.kind,
      loan: row.loan
        ? { ...row.loan, rateChanges: row.loan.rateChanges.map((c) => ({ ...c })) }
        : null,
    };
  }
}
