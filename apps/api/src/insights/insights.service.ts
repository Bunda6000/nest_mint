import { monthlyHistory, monthsEndingAt } from '@nestmint/finance-engine';
import { Inject, Injectable } from '@nestjs/common';
import {
  HISTORY_MONTHS,
  type HistoryResponse,
  type MonthBreakdownResponse,
  TOP_EXPENSES,
} from '@nestmint/shared';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

@Injectable()
export class InsightsService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
  ) {}

  /** Where one month's money went ("YYYY-MM"): totals per category and the biggest transactions. */
  async breakdown(userId: string, month: string): Promise<MonthBreakdownResponse> {
    const [categories, top] = await Promise.all([
      this.transactions.sumByCategory(userId, month),
      this.transactions.listBiggest(userId, month, TOP_EXPENSES),
    ]);
    return { month, categories, top };
  }

  /** The HISTORY_MONTHS months ending at `month`, oldest first. The maths is in the finance engine. */
  async history(userId: string, month: string): Promise<HistoryResponse> {
    const months = monthsEndingAt(month, HISTORY_MONTHS);
    const [sources, expensesByMonth] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumByMonth(userId, months[0]!, month),
    ]);
    return {
      months: monthlyHistory(month, HISTORY_MONTHS, sources, expensesByMonth).map((m) => ({
        month: m.month,
        incomeMkd: m.income,
        expensesMkd: m.expenses,
        netMkd: m.net,
        cumulativeNetMkd: m.cumulativeNet,
        savingsRate: m.savingsRate,
      })),
    };
  }
}
