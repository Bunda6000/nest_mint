import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { loanSchedule, loanTermsInMonth, monthAfter } from '@nestmint/finance-engine';
import {
  type CreateExtraPaymentData,
  type CreateRateChangeData,
  ErrorCode,
  type ObligationResponse,
  type PayOffLoanData,
} from '@nestmint/shared';
import { BILLS_REPOSITORY, type BillsRepository } from '../bills/bills.repository.js';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { expectedAmountInMonth, loanDefinitionOf } from '../obligations/loan-terms.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Obligation not found.');

/** What happens to a loan after it is created: rate changes (NM-15), later extra payments (NM-16). */
@Injectable()
export class LoansService {
  constructor(
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    private readonly clock: Clock,
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

  /**
   * Extra money paid towards a loan. It is saved as an expense and as an extra payment, then the
   * chosen effect is applied: `shorten` ends the loan in the month the schedule now reaches zero
   * (unpaid bills after it are removed, the last one takes what is left to pay); `lower_payment`
   * is a rate change from the next month with the typed payment and the same rate; `none` leaves
   * the bills alone. An extra payment that would pay everything off is refused: use `payOff`.
   * Everything is checked before anything is saved.
   */
  async addExtraPayment(
    userId: string,
    id: string,
    input: CreateExtraPaymentData,
  ): Promise<ObligationResponse> {
    const loan = await this.mustBeLoan(userId, id);
    const month = input.paidOn.slice(0, 7);
    this.assertPaidOn(loan, input.paidOn);
    this.assertNotPaidOff(loan);

    const row = loanSchedule(loanDefinitionOf(loan)!).find((r) => r.month === month);
    if (!row) throw invalid('paidOn', 'The loan was already paid off by then');
    if (input.amountMkd >= row.closingMkd) {
      throw invalid('amountMkd', 'That pays off the whole loan. Use Pay off instead.');
    }
    // The loan's last month always pays what is left, so an extra payment there is a payoff and
    // was refused above; any other month has a later month to carry a lower payment.
    const lowerFrom = monthAfter(month);

    await this.transactions.create(userId, {
      kind: 'expense',
      categoryId: loan.categoryId,
      amountMkd: input.amountMkd,
      occurredOn: input.paidOn,
      note: `Extra payment · ${loan.name}`,
    });
    const saved = await this.obligations.addExtraPayment(userId, id, {
      paidOn: input.paidOn,
      amountMkd: input.amountMkd,
      kind: 'extra',
    });
    if (!saved) throw notFound();

    if (input.effect === 'shorten') await this.shorten(userId, saved);
    if (input.effect === 'lower_payment') {
      const rate = loanTermsInMonth(
        { annualRateBp: saved.loan!.annualRateBp, monthlyPaymentMkd: saved.expectedAmountMkd },
        saved.loan!.rateChanges,
        lowerFrom,
      ).annualRateBp;
      await this.changeRate(userId, id, {
        effectiveMonth: lowerFrom,
        annualRateBp: rate,
        monthlyPaymentMkd: input.newMonthlyPaymentMkd!,
      });
    }
    return (await this.obligations.find(userId, id)) ?? saved;
  }

  /**
   * Pays the loan off: the amount from the bank is saved as an expense and a payoff, the loan ends
   * in the month it was paid and its unpaid bills from that month on are removed (the payoff
   * covers that month). Paid bills stay.
   */
  async payOff(userId: string, id: string, input: PayOffLoanData): Promise<ObligationResponse> {
    const loan = await this.mustBeLoan(userId, id);
    this.assertPaidOn(loan, input.paidOn);
    this.assertNotPaidOff(loan);
    const month = input.paidOn.slice(0, 7);

    await this.transactions.create(userId, {
      kind: 'expense',
      categoryId: loan.categoryId,
      amountMkd: input.amountMkd,
      occurredOn: input.paidOn,
      note: `Loan payoff · ${loan.name}`,
    });
    await this.obligations.addExtraPayment(userId, id, {
      paidOn: input.paidOn,
      amountMkd: input.amountMkd,
      kind: 'payoff',
    });
    await this.obligations.update(userId, id, { endMonth: month });
    await this.bills.deleteUnpaidFromMonth(userId, id, month);
    const updated = await this.obligations.find(userId, id);
    if (!updated) throw notFound();
    return updated;
  }

  /** Ends the loan in the month its schedule now reaches zero, if that is earlier than planned. */
  private async shorten(userId: string, loan: ObligationResponse): Promise<void> {
    const definition = loanDefinitionOf(loan)!;
    const rows = loanSchedule(definition);
    const last = rows[rows.length - 1];
    if (!last || last.month >= loan.endMonth!) return;
    await this.obligations.update(userId, loan.id, { endMonth: last.month });
    await this.bills.deleteUnpaidFromMonth(userId, loan.id, monthAfter(last.month));
    await this.bills.setUnpaidExpectedAmounts(userId, loan.id, last.month, (period) =>
      period === last.month ? last.paymentMkd : expectedAmountInMonth(loan, period),
    );
  }

  private async mustBeLoan(userId: string, id: string): Promise<ObligationResponse> {
    const loan = await this.obligations.find(userId, id);
    if (!loan) throw notFound();
    if (!loan.loan || !loan.endMonth) {
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.Conflict, 'Only a loan has payments.');
    }
    return loan;
  }

  /** The day must not be in the future and its month must lie within the loan's months. */
  private assertPaidOn(loan: ObligationResponse, paidOn: string): void {
    const tomorrow = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (paidOn > tomorrow) throw invalid('paidOn', 'The date cannot be in the future');
    const month = paidOn.slice(0, 7);
    if (month < loan.startMonth || month > loan.endMonth!) {
      throw invalid('paidOn', `Choose a day from ${loan.startMonth} to ${loan.endMonth}`);
    }
  }

  private assertNotPaidOff(loan: ObligationResponse): void {
    if (loan.loan!.extraPayments.some((e) => e.kind === 'payoff')) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This loan is already paid off.',
      );
    }
  }
}

const invalid = (field: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, 'Some fields are invalid.', {
    [field]: message,
  });
