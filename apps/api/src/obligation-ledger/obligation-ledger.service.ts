import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { billAmount, obligationTotals } from '@nestmint/finance-engine';
import { ErrorCode, type LedgerResponse } from '@nestmint/shared';
import { BILLS_REPOSITORY, type BillsRepository } from '../bills/bills.repository.js';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';

/**
 * The history of one obligation (NM-19): all its bills by billing period with the year's totals.
 * Works for archived obligations too, as long as they have bills, so their history stays readable.
 */
@Injectable()
export class ObligationLedgerService {
  constructor(
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    private readonly clock: Clock,
  ) {}

  /** `year` defaults to the current year. */
  async ledger(userId: string, obligationId: string, year?: number): Promise<LedgerResponse> {
    const records = await this.bills.listForObligation(userId, obligationId);
    const obligation =
      records.length === 0 ? await this.obligations.find(userId, obligationId) : null;
    if (records.length === 0 && !obligation) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Obligation not found.');
    }
    const first = records[0];
    const shownYear = year ?? this.clock.now().getUTCFullYear();

    const amounts = records.map((r) => ({
      record: r,
      amountMkd: billAmount({
        paidAmount: r.paid?.amountMkd ?? null,
        actualAmount: r.actualAmountMkd,
        expectedAmount: r.expectedAmountMkd,
      }),
    }));
    const totals = obligationTotals(
      amounts.map((a) => ({ periodMonth: a.record.period, amountMkd: a.amountMkd })),
    );
    const inYear = amounts.filter((a) => a.record.period.startsWith(`${shownYear}-`));
    const years = [...new Set([...totals.byYear.map((y) => y.year), shownYear])].sort(
      (a, b) => a - b,
    );

    return {
      obligationId,
      name: first?.obligationName ?? obligation!.name,
      payee: first ? first.payee : obligation!.payee,
      categoryName: first?.categoryName ?? obligation!.categoryName,
      year: shownYear,
      years,
      rows: inYear.map(({ record, amountMkd }) => ({
        billId: record.id,
        period: record.period,
        dueDate: record.dueDate,
        invoiceRef: record.invoiceRef,
        amountMkd,
        paidOn: record.paid?.paidOn ?? null,
      })),
      yearTotalMkd: inYear.reduce((sum, a) => sum + a.amountMkd, 0),
      yearPaidMkd: inYear.filter((a) => a.record.paid).reduce((sum, a) => sum + a.amountMkd, 0),
      lifetimeMkd: totals.lifetimeMkd,
    };
  }
}
