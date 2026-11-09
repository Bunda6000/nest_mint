import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { dueDateInMonth, isDueInMonth } from '@nestmint/finance-engine';
import { type BillsResponse, ErrorCode, type GenerateBillsResponse } from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';
import { BILLS_REPOSITORY, type BillsRepository, type NewBill } from './bills.repository.js';

/** "2026-11" → "2026-12"; December rolls over into the next year. */
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

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
    this.assertNotTooFarAhead(month);

    const all = await this.obligations.list(userId);
    const due: NewBill[] = all
      .filter((o) =>
        isDueInMonth(
          {
            recurrence: o.recurrence,
            dueDay: o.dueDay,
            everyNMonths: o.everyNMonths,
            months: o.months,
            startMonth: o.startMonth,
            endMonth: o.endMonth,
          },
          month,
        ),
      )
      .map((o) => ({
        obligationId: o.id,
        period: month,
        dueDate: dueDateInMonth(month, o.dueDay),
        expectedAmountMkd: o.expectedAmountMkd,
      }));

    return { month, created: await this.bills.createMissing(userId, due) };
  }

  async list(userId: string, month: string): Promise<BillsResponse> {
    return { bills: await this.bills.listMonth(userId, month) };
  }

  private assertNotTooFarAhead(month: string): void {
    const latest = nextMonth(this.clock.now().toISOString().slice(0, 7));
    if (month > latest) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        { month: 'Choose this month, next month or an earlier one' },
      );
    }
  }
}
