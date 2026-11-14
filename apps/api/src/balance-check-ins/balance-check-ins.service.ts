import { addMonths, balanceCheckIn, monthlyTotals } from '@nestmint/finance-engine';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type BalanceCheckInResponse,
  type BalanceCheckInStatusResponse,
  ErrorCode,
  type SaveBalanceCheckInData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';
import {
  BALANCE_CHECK_INS_REPOSITORY,
  type BalanceCheckInsRepository,
  type StoredCheckIn,
} from './balance-check-ins.repository.js';

const fieldError = (field: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, 'Some fields are invalid.', {
    [field]: message,
  });

@Injectable()
export class BalanceCheckInsService {
  private readonly logger = new Logger(BalanceCheckInsService.name);

  constructor(
    @Inject(BALANCE_CHECK_INS_REPOSITORY) private readonly checkIns: BalanceCheckInsRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    private readonly clock: Clock,
  ) {}

  /** The check-in of a month if there is one, and whether the opening balance must be typed in. */
  async status(userId: string, month: string): Promise<BalanceCheckInStatusResponse> {
    const [saved, previous] = await Promise.all([
      this.checkIns.find(userId, month),
      this.checkIns.findBefore(userId, month),
    ]);
    const openingKnown = previous !== null || saved?.openingMkd != null;
    return {
      month,
      checkIn: saved ? await this.work(userId, saved, previous) : null,
      needsOpening: !openingKnown,
    };
  }

  /** Saves the month's check-in, replacing an earlier one for the same month. */
  async save(
    userId: string,
    month: string,
    input: SaveBalanceCheckInData,
  ): Promise<BalanceCheckInResponse> {
    if (month > this.clock.now().toISOString().slice(0, 7)) {
      throw fieldError('month', 'A month that has not started yet cannot be checked');
    }
    const [saved, previous] = await Promise.all([
      this.checkIns.find(userId, month),
      this.checkIns.findBefore(userId, month),
    ]);
    if (previous && input.openingBalanceMkd !== undefined) {
      throw fieldError(
        'openingBalanceMkd',
        `Not needed: the opening balance is the balance checked in ${previous.month}`,
      );
    }
    const openingMkd = previous ? null : (input.openingBalanceMkd ?? saved?.openingMkd ?? null);
    if (!previous && openingMkd === null) {
      throw fieldError('openingBalanceMkd', 'Enter the balance at the start of the month');
    }
    const stored: StoredCheckIn = { month, closingMkd: input.closingBalanceMkd, openingMkd };
    await this.checkIns.save(userId, stored);
    this.logger.log(`Balance check-in saved for ${month}`);
    return this.work(userId, stored, previous);
  }

  private async work(
    userId: string,
    stored: StoredCheckIn,
    previous: StoredCheckIn | null,
  ): Promise<BalanceCheckInResponse> {
    const fromMonth = previous ? addMonths(previous.month, 1) : stored.month;
    const openingMkd = previous ? previous.closingMkd : (stored.openingMkd ?? 0);
    const months: string[] = [];
    for (let m = fromMonth; m <= stored.month; m = addMonths(m, 1)) months.push(m);

    const [sources, spent] = await Promise.all([
      this.income.list(userId),
      Promise.all(months.map((m) => this.transactions.sumMonth(userId, m))),
    ]);
    const incomeMkd = months.reduce((sum, m) => sum + monthlyTotals(m, sources, 0).income, 0);
    const expensesMkd = spent.reduce((sum, value) => sum + value, 0);

    const result = balanceCheckIn({
      openingMkd,
      incomeMkd,
      expensesMkd,
      closingMkd: stored.closingMkd,
    });
    return {
      month: stored.month,
      fromMonth,
      openingMkd,
      closingMkd: stored.closingMkd,
      incomeMkd,
      expensesMkd,
      expectedMkd: result.expectedMkd,
      untrackedMkd: result.untrackedMkd,
      alert: result.alert,
    };
  }
}
