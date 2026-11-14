import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type CreateRateChangeData, ErrorCode, type ObligationResponse } from '@nestmint/shared';
import { BILLS_REPOSITORY, type BillsRepository } from '../bills/bills.repository.js';
import { ApiException } from '../common/api.exception.js';
import { expectedAmountInMonth } from '../obligations/loan-terms.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';

const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Obligation not found.');

/** What happens to a loan after it is created: rate changes (NM-15), later extra payments (NM-16). */
@Injectable()
export class LoansService {
  constructor(
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
  ) {}

  /**
   * New terms from a month on. The month must lie within the loan's months. The change is saved,
   * then the unpaid bills from that month on take the payment in force for their month (paid bills
   * and invoice amounts are left alone). A second change for the same month replaces the first, so
   * repeating the request is safe, including after a failure between the two steps.
   */
  async changeRate(
    userId: string,
    id: string,
    input: CreateRateChangeData,
  ): Promise<ObligationResponse> {
    const loan = await this.obligations.find(userId, id);
    if (!loan) throw notFound();
    if (!loan.loan || !loan.endMonth) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'Only a loan has rate changes.',
      );
    }
    if (input.effectiveMonth < loan.startMonth || input.effectiveMonth > loan.endMonth) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        {
          effectiveMonth: `Choose a month from ${loan.startMonth} to ${loan.endMonth}`,
        },
      );
    }

    const updated = await this.obligations.upsertRateChange(userId, id, {
      effectiveMonth: input.effectiveMonth,
      annualRateBp: input.annualRateBp,
      monthlyPaymentMkd: input.monthlyPaymentMkd,
    });
    if (!updated) throw notFound();

    await this.bills.setUnpaidExpectedAmounts(userId, id, input.effectiveMonth, (period) =>
      expectedAmountInMonth(updated, period),
    );
    return updated;
  }
}
