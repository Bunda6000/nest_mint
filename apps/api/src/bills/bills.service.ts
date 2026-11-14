import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  billAmount,
  billStatus,
  dueDateInMonth,
  dueMonthsBetween,
  isDueInMonth,
  shiftMonth,
} from '@nestmint/finance-engine';
import {
  type BillResponse,
  type BillsInboxResponse,
  type BillsResponse,
  type BillStatus,
  ErrorCode,
  type GenerateBillsResponse,
  type ObligationResponse,
  PAID_TAB_LIMIT,
  type PayBillData,
  type PayBillsData,
  type SyncBillsResponse,
  type UpdateBillData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { expectedAmountInMonth } from '../obligations/loan-terms.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';
import {
  BILLS_REPOSITORY,
  BillPaymentError,
  type BillRecord,
  type BillsRepository,
  type NewBill,
  type Payment,
} from './bills.repository.js';

/** Bills missed longer ago than this are not caught up (a bill entered with an old start month). */
export const MAX_CATCH_UP_MONTHS = 36;

const DAY_MS = 24 * 60 * 60 * 1000;

const conflict = (message: string) =>
  new ApiException(HttpStatus.CONFLICT, ErrorCode.Conflict, message);
const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Bill not found.');

@Injectable()
export class BillsService {
  constructor(
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Makes sure every bill due in the month exists. Safe to call as often as you like: a bill that
   * exists is left as it is (keeping the amount it was created with), a missing one is created.
   * Only this month, next month or an earlier one, so reading never invents bills far ahead.
   */
  async generate(userId: string, month: string): Promise<GenerateBillsResponse> {
    const latest = this.nextMonthOfToday();
    if (month > latest) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { month: 'Choose this month, next month or an earlier one' },
      );
    }

    const all = await this.obligations.list(userId);
    const due: NewBill[] = all
      .filter((o) => isDueInMonth(scheduleOf(o), month))
      .map((o) => newBill(o, month));

    return { month, created: await this.bills.createMissing(userId, due) };
  }

  /**
   * Catching up: creates every bill that should exist and does not, from the month each obligation
   * was entered (or its first month, if that is later) up to next month. So a month in which the
   * user never opened Bills still shows its unpaid bills as overdue. Safe to repeat.
   */
  async sync(userId: string): Promise<SyncBillsResponse> {
    const through = this.nextMonthOfToday();
    const earliest = shiftMonth(through, -MAX_CATCH_UP_MONTHS);

    const missing: NewBill[] = [];
    for (const o of await this.obligations.list(userId)) {
      const from = [o.startMonth, o.createdMonth, earliest].reduce((a, b) => (a > b ? a : b));
      for (const month of dueMonthsBetween(scheduleOf(o), from, through)) {
        missing.push(newBill(o, month));
      }
    }
    return { created: await this.bills.createMissing(userId, missing) };
  }

  /** The bills of one month (read only; see `generate`), each with where it stands on `asOf`. */
  async list(userId: string, month: string, asOf?: string): Promise<BillsResponse> {
    const day = this.resolveDay(asOf, 'asOf');
    const records = await this.bills.listMonth(userId, month);
    return { bills: records.map((r) => toResponse(r, day)) };
  }

  /**
   * One tab of the inbox. Due: unpaid, due today or later. Overdue: unpaid and due before today.
   * Paid: the latest payments. The counts of all three tabs come with every tab.
   */
  async inbox(userId: string, tab: BillStatus, asOf?: string): Promise<BillsInboxResponse> {
    const day = this.resolveDay(asOf, 'asOf');
    const [unpaid, paidCount] = await Promise.all([
      this.bills.listUnpaid(userId),
      this.bills.countPaid(userId),
    ]);
    const open = unpaid.map((r) => toResponse(r, day));
    const due = open.filter((b) => b.status === 'due');
    const overdue = open.filter((b) => b.status === 'overdue');

    let bills: BillResponse[];
    if (tab === 'paid') {
      bills = (await this.bills.listPaid(userId, PAID_TAB_LIMIT)).map((r) => toResponse(r, day));
    } else {
      bills = tab === 'due' ? due : overdue;
    }
    return { tab, bills, counts: { due: due.length, overdue: overdue.length, paid: paidCount } };
  }

  /**
   * Pays one bill: an expense is created in the bill's category (on the given day, default today,
   * for the given amount, default what the bill costs now) and the bill is linked to it.
   * An archived category does not stop a payment: the bill already exists and is owed.
   */
  async pay(userId: string, id: string, input: PayBillData): Promise<BillResponse> {
    const record = await this.requireUnpaid(userId, id);
    const paidOn = this.resolveDay(input.paidOn, 'paidOn');
    const amountMkd = input.amountMkd ?? billAmount(amountsOf(record));

    const [paid] = await this.runPayment(() =>
      this.bills.pay(userId, [{ billId: id, paidOn, amountMkd }]),
    );
    return toResponse(paid!, this.today());
  }

  /** Pays several bills on one day, each for what it costs now. All are paid, or none is. */
  async payMany(userId: string, input: PayBillsData): Promise<BillsResponse> {
    const paidOn = this.resolveDay(input.paidOn, 'paidOn');
    const payments: Payment[] = [];
    for (const id of input.billIds) {
      const record = await this.requireUnpaid(userId, id);
      payments.push({ billId: id, paidOn, amountMkd: billAmount(amountsOf(record)) });
    }
    const paid = await this.runPayment(() => this.bills.pay(userId, payments));
    return { bills: paid.map((r) => toResponse(r, this.today())) };
  }

  /** Takes a payment back: the bill is unpaid again and the expense it created is removed. */
  async undoPayment(userId: string, id: string): Promise<BillResponse> {
    const record = await this.runPayment(() => this.bills.undoPayment(userId, id));
    return toResponse(record, this.today());
  }

  /** Enter the actual amount and/or the invoice reference of an unpaid bill. */
  async update(userId: string, id: string, input: UpdateBillData): Promise<BillResponse> {
    await this.requireUnpaid(userId, id);
    const updated = await this.bills.update(userId, id, {
      ...(input.actualAmountMkd !== undefined && { actualAmountMkd: input.actualAmountMkd }),
      ...(input.invoiceRef !== undefined && { invoiceRef: input.invoiceRef }),
    });
    if (!updated) {
      // Paid between the check and the change.
      throw (await this.bills.find(userId, id)) ? alreadyPaid() : notFound();
    }
    return toResponse(updated, this.today());
  }

  private async requireUnpaid(userId: string, id: string): Promise<BillRecord> {
    const record = await this.bills.find(userId, id);
    if (!record) throw notFound();
    if (record.paid) throw alreadyPaid();
    return record;
  }

  private async runPayment<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof BillPaymentError)) throw error;
      if (error.reason === 'not_found') throw notFound();
      throw error.reason === 'already_paid' ? alreadyPaid() : conflict('This bill is not paid.');
    }
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private nextMonthOfToday(): string {
    return shiftMonth(this.today().slice(0, 7), 1);
  }

  /**
   * The day to use: the one given, else today. One day of slack, because the phone's "today" can be
   * a day ahead of the server's UTC date; further ahead is refused.
   */
  private resolveDay(day: string | undefined, field: string): string {
    const today = this.today();
    if (day === undefined) return today;
    const latest = new Date(Date.parse(`${today}T00:00:00.000Z`) + DAY_MS)
      .toISOString()
      .slice(0, 10);
    if (day > latest) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { [field]: 'Date cannot be in the future' },
      );
    }
    return day;
  }
}

const alreadyPaid = () => conflict('This bill is already paid.');

function scheduleOf(o: {
  recurrence: 'monthly' | 'every_n_months' | 'custom_months';
  dueDay: number;
  everyNMonths: number | null;
  months: number[] | null;
  startMonth: string;
  endMonth: string | null;
}) {
  return {
    recurrence: o.recurrence,
    dueDay: o.dueDay,
    everyNMonths: o.everyNMonths,
    months: o.months,
    startMonth: o.startMonth,
    endMonth: o.endMonth,
  };
}

/** A loan's bill expects the payment in force in its month, so a rate change reaches only later months. */
const newBill = (
  o: Pick<
    ObligationResponse,
    'id' | 'dueDay' | 'expectedAmountMkd' | 'loan' | 'installment' | 'startMonth'
  >,
  month: string,
): NewBill => ({
  obligationId: o.id,
  period: month,
  dueDate: dueDateInMonth(month, o.dueDay),
  expectedAmountMkd: expectedAmountInMonth(o, month),
});

const amountsOf = (r: BillRecord) => ({
  paidAmount: r.paid?.amountMkd ?? null,
  actualAmount: r.actualAmountMkd,
  expectedAmount: r.expectedAmountMkd,
});

function toResponse(r: BillRecord, asOf: string): BillResponse {
  return {
    id: r.id,
    obligationId: r.obligationId,
    obligationName: r.obligationName,
    payee: r.payee,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    period: r.period,
    dueDate: r.dueDate,
    expectedAmountMkd: r.expectedAmountMkd,
    actualAmountMkd: r.actualAmountMkd,
    invoiceRef: r.invoiceRef,
    amountMkd: billAmount(amountsOf(r)),
    status: billStatus({ paid: r.paid !== null, dueDate: r.dueDate }, asOf),
    paidOn: r.paid?.paidOn ?? null,
    transactionId: r.paid?.transactionId ?? null,
  };
}
