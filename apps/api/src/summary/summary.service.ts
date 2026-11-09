import { monthlyTotals } from '@nestmint/finance-engine';
import { Inject, Injectable } from '@nestjs/common';
import type { MonthSummaryResponse } from '@nestmint/shared';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

@Injectable()
export class SummaryService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
  ) {}

  /** The cash-view totals of one month ("YYYY-MM") for one user. The maths is in the finance engine. */
  async month(userId: string, month: string): Promise<MonthSummaryResponse> {
    const [sources, expenses] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumMonth(userId, month),
    ]);
    const totals = monthlyTotals(month, sources, expenses);
    return {
      month: totals.month,
      incomeMkd: totals.income,
      expensesMkd: totals.expenses,
      netMkd: totals.net,
      savingsRate: totals.savingsRate,
    };
  }
}
